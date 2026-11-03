using System.Diagnostics;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
namespace Fleet.Worker;
public sealed record WorkerSettings(string WorkerId, string ServerCertificate, string ServerKey, string ControllerCa, string ControllerThumbprint, string DataRoot, string CodexPath, string GitPath, string GhPath) {
    public static WorkerSettings Load(string path) {
        var value = JsonSerializer.Deserialize<WorkerSettings>(File.ReadAllText(path), new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? throw new InvalidOperationException("Missing configuration.");
        if (!Guid.TryParse(value.WorkerId, out _) || string.IsNullOrWhiteSpace(value.ControllerThumbprint)) throw new InvalidOperationException("Invalid identity.");
        foreach (var file in new[] {value.ServerCertificate,value.ServerKey,value.ControllerCa,value.CodexPath,value.GitPath,value.GhPath}) if (!Path.IsPathFullyQualified(file) || !File.Exists(file)) throw new InvalidOperationException("Required file is unavailable.");
        if (!Path.IsPathFullyQualified(value.DataRoot)) throw new InvalidOperationException("Data root must be absolute.");
        Directory.CreateDirectory(value.DataRoot);
        if ((File.GetAttributes(value.DataRoot) & FileAttributes.ReparsePoint) != 0) throw new InvalidOperationException("Data root cannot be a link.");
        return value;
    }
}
public static class CertificateTrust {
    public static bool Validate(X509Certificate2? certificate, X509Certificate2 authority, string thumbprint) {
        if (certificate is null || !string.Equals(certificate.GetCertHashString(System.Security.Cryptography.HashAlgorithmName.SHA256), thumbprint.Replace(" ", ""), StringComparison.OrdinalIgnoreCase)) return false;
        using var chain = new X509Chain();
        chain.ChainPolicy.TrustMode = X509ChainTrustMode.CustomRootTrust;
        chain.ChainPolicy.CustomTrustStore.Add(authority);
        chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck; // Offline private CA plus exact leaf pin.
        chain.ChainPolicy.ApplicationPolicy.Add(new System.Security.Cryptography.Oid("1.3.6.1.5.5.7.3.2"));
        return chain.Build(certificate);
    }
}
public sealed record InputRequest(string Input);
public sealed record ApprovalRequest(string Decision);
public sealed record TaskRequest(string RepositoryUrl, string Prompt, string? Model, Guid? Id);
public sealed record WorkerEvent(long Sequence, string Type, Guid? TaskId, string State, DateTimeOffset At);
public sealed class Events {
    readonly Queue<WorkerEvent> entries = new(); long sequence;
    public void Add(string type, Guid? task, string state) { lock(entries) { entries.Enqueue(new(++sequence,type,task,state,DateTimeOffset.UtcNow)); while(entries.Count>256) entries.Dequeue(); } }
    public WorkerEvent[] Since(long after) { lock(entries) return entries.Where(x=>x.Sequence>after).ToArray(); }
}
public static class Commands {
    public static Process Start(string executable, IEnumerable<string> arguments, string? cwd = null) {
        var info = new ProcessStartInfo(executable) { UseShellExecute=false, RedirectStandardInput=true, RedirectStandardOutput=true, RedirectStandardError=true, CreateNoWindow=true, WorkingDirectory=cwd ?? AppContext.BaseDirectory };
        foreach(var argument in arguments) info.ArgumentList.Add(argument);
        return Process.Start(info) ?? throw new InvalidOperationException("Process unavailable.");
    }
    public static async Task<(int Code,string Output)> Run(string executable, string[] arguments, string? cwd=null, CancellationToken cancellation=default) {
        using var process=Start(executable,arguments,cwd); using var timeout=CancellationTokenSource.CreateLinkedTokenSource(cancellation); timeout.CancelAfter(TimeSpan.FromMinutes(5));
        try { var output=ReadBounded(process.StandardOutput,timeout.Token); var error=ReadBounded(process.StandardError,timeout.Token); await process.WaitForExitAsync(timeout.Token); await error; return(process.ExitCode,await output); }
        finally { if(!process.HasExited) process.Kill(true); }
    }
    static async Task<string> ReadBounded(StreamReader reader,CancellationToken cancellation) {
        var result=new System.Text.StringBuilder(); var buffer=new char[1024];
        while(true) { var count=await reader.ReadAsync(buffer.AsMemory(),cancellation); if(count==0) return result.ToString(); if(result.Length+count>65536) throw new InvalidOperationException("Command output exceeded its bound."); result.Append(buffer,0,count); }
    }
}
