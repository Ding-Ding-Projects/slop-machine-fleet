using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using Fleet.Worker;
var checks=0;
void Check(bool passed,string name) { if(!passed) throw new Exception(name); checks++; Console.WriteLine("PASS "+name); }
using var rootKey=RSA.Create(2048);
var rootRequest=new CertificateRequest("CN=Worker test CA",rootKey,HashAlgorithmName.SHA256,RSASignaturePadding.Pkcs1);
rootRequest.CertificateExtensions.Add(new X509BasicConstraintsExtension(true,false,0,true));
rootRequest.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.KeyCertSign,true));
using var root=rootRequest.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1),DateTimeOffset.UtcNow.AddDays(1));
using var clientKey=RSA.Create(2048);
var clientRequest=new CertificateRequest("CN=Controller test",clientKey,HashAlgorithmName.SHA256,RSASignaturePadding.Pkcs1);
clientRequest.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension(new OidCollection{new Oid("1.3.6.1.5.5.7.3.2")},true));
using var client=clientRequest.Create(root,DateTimeOffset.UtcNow.AddHours(-1),DateTimeOffset.UtcNow.AddHours(1),RandomNumberGenerator.GetBytes(16));
var leafHash=client.GetCertHashString(HashAlgorithmName.SHA256);
Check(CertificateTrust.Validate(client,root,leafHash),"enrolled CA and leaf accepted");
Check(!CertificateTrust.Validate(client,root,new string('0',40)),"wrong leaf rejected");
Check(!CertificateTrust.Validate(null,root,leafHash),"missing certificate rejected");
using var otherKey=RSA.Create(2048);
var otherRequest=new CertificateRequest("CN=Other root",otherKey,HashAlgorithmName.SHA256,RSASignaturePadding.Pkcs1);
otherRequest.CertificateExtensions.Add(new X509BasicConstraintsExtension(true,false,0,true));
using var other=otherRequest.CreateSelfSigned(DateTimeOffset.UtcNow.AddDays(-1),DateTimeOffset.UtcNow.AddDays(1));
Check(!CertificateTrust.Validate(client,other,leafHash),"wrong CA rejected despite correct leaf pin");
var events=new Events(); for(var i=0;i<300;i++) events.Add("task",null,"running");
Check(events.Since(0).Length==256,"event replay bounded");
Check(events.Since(299).Single().Sequence==300,"event replay cursor respected");
var folder=Path.Combine(Path.GetTempPath(),"fleet-worker-check-"+Guid.NewGuid().ToString("N"));
Directory.CreateDirectory(Path.Combine(folder,"tasks"));
var id=Guid.NewGuid(); File.WriteAllText(Path.Combine(folder,"tasks",id+".json"),JsonSerializer.Serialize(new TaskState(id,"running","thread","turn")));
var settings=new WorkerSettings(Guid.NewGuid().ToString(),"none","none","none","none",folder,"none","none","none");
using var manager=new TaskManager(settings,events);
Check(manager.Get(id).State=="interrupted","restart does not rerun interrupted task");
foreach(var url in new[]{"http://github.com/a/b","https://user:pass@github.com/a/b","https://127.0.0.1/a/b","https://github.com/a/b?secret=x","https://github.com/a/b/../../x"}) {
    try { await manager.Start(new(url,"hello",null,null)); Check(false,"unsafe URL accepted"); } catch(ArgumentException) { Check(true,"unsafe repository URL rejected"); }
}
Console.WriteLine($"PASS {checks} worker checks");
using(var terminal=new PseudoTerminal(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"where.exe"),"cmd.exe")) {
    using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(10));
    var buffer=new char[1024]; var text="";
    while(!text.Contains("cmd.exe",StringComparison.OrdinalIgnoreCase)) { var count=await terminal.Read(buffer,timeout.Token); if(count==0) break; text+=new string(buffer,0,count); }
    Check(text.Contains("cmd.exe",StringComparison.OrdinalIgnoreCase),"native ConPTY reads actual child output");
    Check(await terminal.Wait(timeout.Token)==0,"native ConPTY returns actual child exit status");
}
Console.WriteLine($"PASS {checks} total worker checks");
var enrollment=Path.Combine(folder,"enrollment");Directory.CreateDirectory(enrollment);var workerId=Guid.NewGuid();File.WriteAllText(Path.Combine(enrollment,"worker-id"),workerId.ToString());
var executable=Path.Combine(AppContext.BaseDirectory,"Fleet.Worker.exe");
var first=await Commands.Run(executable,["--enroll-request="+enrollment]);
using var request=JsonDocument.Parse(first.Output);
Check(first.Code==0&&request.RootElement.GetProperty("workerId").GetGuid()==workerId,"native enrollment returns matching public identity");
Check(request.RootElement.GetProperty("csr").GetString()!.Contains("BEGIN CERTIFICATE REQUEST",StringComparison.Ordinal),"native enrollment returns a public CSR");
var keyHash=SHA256.HashData(File.ReadAllBytes(Path.Combine(enrollment,"server.key")));
var second=await Commands.Run(executable,["--enroll-request="+enrollment]);
Check(second.Code==0&&keyHash.SequenceEqual(SHA256.HashData(File.ReadAllBytes(Path.Combine(enrollment,"server.key")))),"enrollment retry preserves the local private key");
Console.WriteLine($"PASS {checks} total worker checks");
// The unique test directory is retained for diagnostics; it contains synthetic metadata only.
