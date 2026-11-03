using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Json;
namespace Fleet.Worker;
public sealed class AppServer : IDisposable {
    readonly Process process; readonly CancellationTokenSource stop=new();
    readonly ConcurrentDictionary<long,TaskCompletionSource<JsonElement>> pending=new();
    readonly ConcurrentDictionary<string,JsonElement> approvals=new();
    readonly SemaphoreSlim write=new(1,1); long nextId;
    public event Action<string,JsonElement>? Notification;
    public event Action? Exited;
    public string[] PendingApprovals => approvals.Keys.ToArray();
    public AppServer(string executable,string cwd) {
        process=Commands.Start(executable,["app-server","--stdio"],cwd);
        _=DrainError(); _=Read();
    }
    async Task DrainError() { try { var buffer=new char[1024]; while(await process.StandardError.ReadAsync(buffer.AsMemory(),stop.Token)>0) { } } catch(OperationCanceledException) { } }
    public async Task Initialize() { await Call("initialize",new { clientInfo=new { name="slop-machine-fleet-worker",version="0.1.0" },capabilities=new { experimentalApi=true } }); await Send(new {method="initialized"}); }
    public async Task<JsonElement> Call(string method,object parameters) {
        var id=Interlocked.Increment(ref nextId); var completion=new TaskCompletionSource<JsonElement>(TaskCreationOptions.RunContinuationsAsynchronously);
        pending[id]=completion;
        try { await Send(new {id,method,@params=parameters}); return await completion.Task.WaitAsync(TimeSpan.FromSeconds(60),stop.Token); }
        finally { pending.TryRemove(id,out _); }
    }
    public async Task Reply(string id,string decision) {
        if(decision is not ("accept" or "decline" or "cancel")) throw new ArgumentException("Invalid approval decision.");
        if(!approvals.TryRemove(id,out var request)) throw new InvalidOperationException("Approval is not pending.");
        await Send(new {id=request,result=new {decision}});
    }
    async Task Send(object message) {
        await write.WaitAsync(stop.Token);
        try { await process.StandardInput.WriteLineAsync(JsonSerializer.Serialize(message)); await process.StandardInput.FlushAsync(); }
        finally { write.Release(); }
    }
    async Task Read() {
        try {
            while(await process.StandardOutput.ReadLineAsync(stop.Token) is {} line) {
                if(line.Length>1048576) throw new InvalidOperationException("Protocol frame too large.");
                using var message=JsonDocument.Parse(line); var root=message.RootElement;
                if(root.TryGetProperty("method",out var method)) {
                    var name=method.GetString()??"unknown";
                    var parameters=root.TryGetProperty("params",out var p)?p.Clone():default;
                    if(root.TryGetProperty("id",out var requestId)) {
                        if(name is "item/commandExecution/requestApproval" or "item/fileChange/requestApproval") approvals[requestId.ToString()]=requestId.Clone();
                        else await Send(new {id=requestId.Clone(),error=new {code=-32601,message="Unsupported worker request"}});
                    }
                    Notification?.Invoke(name,parameters);
                } else if(root.TryGetProperty("id",out var id) && id.TryGetInt64(out var number) && pending.TryGetValue(number,out var completion)) {
                    if(root.TryGetProperty("error",out _)) completion.TrySetException(new InvalidOperationException("App-server rejected request."));
                    else completion.TrySetResult(root.GetProperty("result").Clone());
                }
            }
        } catch(Exception) { /* Only normalized state is exposed to callers. */ }
        finally { foreach(var value in pending.Values) value.TrySetException(new InvalidOperationException("App-server ended.")); Exited?.Invoke(); }
    }
    public void Dispose() { stop.Cancel(); if(!process.HasExited) process.Kill(true); process.Dispose(); stop.Dispose(); }
}
