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
void Notify(TaskOutput transcript,string method,string payload) {using var fixture=JsonDocument.Parse(payload);transcript.Record(method,fixture.RootElement);}
var transcript=new TaskOutput(Guid.NewGuid());
Notify(transcript,"item/agentMessage/delta","{\"threadId\":\"t\",\"turnId\":\"u\",\"itemId\":\"a\",\"delta\":\"Actual assistant \"}");
Check(transcript.Snapshot(0,100).Events.Length==0,"partial output line withheld until safe boundary");
Notify(transcript,"item/agentMessage/delta","{\"threadId\":\"t\",\"turnId\":\"u\",\"itemId\":\"a\",\"delta\":\"message\\n\"}");
Check(transcript.Snapshot(0,100).Events.Single().Content=="Actual assistant message\n","assistant deltas produce actual ordered text");
Notify(transcript,"item/started","{\"threadId\":\"t\",\"turnId\":\"u\",\"item\":{\"id\":\"c\",\"type\":\"commandExecution\",\"command\":\"dotnet build\",\"status\":\"inProgress\"}}");
Notify(transcript,"item/commandExecution/outputDelta","{\"threadId\":\"t\",\"turnId\":\"u\",\"itemId\":\"c\",\"delta\":\"build stdout\\nbuild stderr\\n\"}");
Notify(transcript,"item/completed","{\"threadId\":\"t\",\"turnId\":\"u\",\"item\":{\"id\":\"c\",\"type\":\"commandExecution\",\"command\":\"dotnet build\",\"status\":\"completed\",\"exitCode\":0,\"aggregatedOutput\":\"must not duplicate streamed output\"}}");
var commandEvents=transcript.Snapshot(0,100).Events;
Check(commandEvents.Count(x=>x.Kind=="command-output")==2&&commandEvents.Where(x=>x.Kind=="command-output").All(x=>x.Stream=="combined"),"task command output keeps actual multiplexed stream semantics");
Check(!commandEvents.Any(x=>x.Content.Contains("must not duplicate")),"completed aggregate does not duplicate streamed command text");
Notify(transcript,"item/fileChange/patchUpdated","{\"threadId\":\"t\",\"turnId\":\"u\",\"itemId\":\"f\",\"changes\":[{\"path\":\"src/example.cs\",\"kind\":{\"type\":\"update\"},\"diff\":\"not copied\"}]}");
Check(transcript.Snapshot(0,100).Events.Any(x=>x.Kind=="file-change"&&x.Content=="update: src/example.cs"),"file change progress uses actual path and operation");
Notify(transcript,"turn/plan/updated","{\"threadId\":\"t\",\"turnId\":\"u\",\"plan\":[{\"step\":\"Compile worker\",\"status\":\"completed\"}]}");
Check(transcript.Snapshot(0,100).Events.Any(x=>x.Kind=="progress"&&x.Content.Contains("Compile worker")),"actual plan progress is observable");
var beforeAuth=transcript.LatestSequence;
Notify(transcript,"account/login/completed","{\"authId\":\"not-task-data\",\"success\":true}");
Notify(transcript,"process/outputDelta","{\"processHandle\":\"unrelated\",\"stream\":\"stderr\",\"deltaBase64\":\"b3V0cHV0\",\"capReached\":false}");
Check(transcript.LatestSequence==beforeAuth,"authentication and uncorrelated process data excluded");
var redaction=new TaskOutput(Guid.NewGuid());
Notify(redaction,"item/agentMessage/delta","{\"itemId\":\"s\",\"delta\":\"Bearer \"}");
Notify(redaction,"item/agentMessage/delta","{\"itemId\":\"s\",\"delta\":\"example-sensitive-value\\n\"}");
Check(redaction.Snapshot(0,100).Events.All(x=>x.Redacted&&!x.Content.Contains("example-sensitive-value")),"credential patterns split across protocol deltas withheld");
Notify(redaction,"item/started","{\"item\":{\"id\":\"p\",\"type\":\"commandExecution\",\"command\":\"type PERSONAL_VOCABULARY.json\"}}");
Notify(redaction,"item/commandExecution/outputDelta","{\"itemId\":\"p\",\"delta\":\"private mapping contents\\n\"}");
Check(!redaction.Snapshot(0,100).Events.Any(x=>x.Content.Contains("private mapping contents")),"personal wording file command output withheld");
Notify(redaction,"item/agentMessage/delta","{\"itemId\":\"code\",\"delta\":\"ABCD-EFGH\\n\"}");
Check(!redaction.Snapshot(0,100).Events.Any(x=>x.Content.Contains("ABCD-EFGH")),"one-time code-shaped output withheld");
var pressure=new TaskOutput(Guid.NewGuid());for(var i=0;i<700;i++) pressure.State("running");
var firstPage=pressure.Snapshot(0,20);var nextPage=pressure.Snapshot(firstPage.NextCursor,20);
Check(firstPage.Gap&&firstPage.Truncated&&firstPage.Events.Length==20&&firstPage.OldestSequence>1,"bounded replay reports evicted history and remaining pages");
Check(nextPage.Events[0].Sequence==firstPage.NextCursor+1,"replay cursors do not duplicate or skip retained events");
var restarted=new TaskOutput(Guid.NewGuid(),700,true);restarted.State("interrupted");var restartSnapshot=restarted.Snapshot(0,100);
Check(restartSnapshot.Gap&&restartSnapshot.ResetReason=="worker-restarted"&&restartSnapshot.Events.Single().Sequence==701,"restart preserves monotonic cursor and reports lost transient history");
var oversized=new TaskOutput(Guid.NewGuid());
using(var huge=JsonDocument.Parse(JsonSerializer.Serialize(new {itemId="long",delta=new string('x',10000)+"\n"}))) oversized.Record("item/agentMessage/delta",huge.RootElement);
Check(oversized.Snapshot(0,100).Events.All(x=>x.Truncated&&x.Content.Length<=2048),"oversized partial lines produce truthful bounded omission markers");
var ahead=pressure.Snapshot(99999,100);Check(ahead.Gap&&ahead.ResetReason=="cursor-ahead-of-worker"&&ahead.NextCursor==ahead.LatestSequence,"ahead cursor receives explicit reset and valid replacement cursor");
var bytePressure=new TaskOutput(Guid.NewGuid());
for(var i=0;i<100;i++) {using var chunk=JsonDocument.Parse(JsonSerializer.Serialize(new {itemId="bytes",delta=new string('\u754c',2040)+"\n"}));bytePressure.Record("item/agentMessage/delta",chunk.RootElement);}
var byteSnapshot=bytePressure.Snapshot(0,200);
Check(byteSnapshot.Gap&&JsonSerializer.SerializeToUtf8Bytes(byteSnapshot.Events,new JsonSerializerOptions(JsonSerializerDefaults.Web)).Length<=256*1024,"serialized replay byte budget includes JSON escaping");
Console.WriteLine($"PASS {checks} total worker checks");
using(var pairing=JsonDocument.Parse(JsonSerializer.Serialize(new {manualPairingCode="TEST-CODE",expiresAt=DateTimeOffset.UtcNow.AddMinutes(5).ToUnixTimeSeconds()}))) {
    var state=AuthManager.ParsePairing(pairing.RootElement); Check(state.State=="code-issued"&&state.UserCode=="TEST-CODE"&&state.ExpiresAt.HasValue,"official pairing fields and Unix expiry parsed");
}
using(var expiredPairing=JsonDocument.Parse("{\"manualPairingCode\":\"TEST-CODE\",\"expiresAt\":1}")) Check(AuthManager.ParsePairing(expiredPairing.RootElement).State=="expired","provider-expired pairing code is not offered");
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
