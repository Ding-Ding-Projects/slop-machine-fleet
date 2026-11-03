using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Json;
namespace Fleet.Worker;
public sealed record PendingApproval(string RequestId,string Method,string Summary,string[] Permissions,bool DetailsAvailable,bool Redacted);
public sealed class AppServer : IDisposable {
    readonly Process process; readonly CancellationTokenSource stop=new();
    readonly ConcurrentDictionary<long,TaskCompletionSource<JsonElement>> pending=new();
    readonly ConcurrentDictionary<string,JsonElement> approvals=new();
    readonly ConcurrentDictionary<string,PendingApproval> approvalDetails=new();
    readonly ConcurrentDictionary<string,string[]> changedFiles=new();
    readonly SemaphoreSlim write=new(1,1); long nextId;
    public event Action<string,JsonElement>? Notification;
    public event Action? Exited;
    public string[] PendingApprovals => approvals.Keys.ToArray();
    public PendingApproval[] ApprovalDetails => approvalDetails.Values.ToArray();
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
        if(decision=="accept"&&(!approvalDetails.TryGetValue(id,out var detail)||!detail.DetailsAvailable)) { approvals[id]=request; throw new InvalidOperationException("Complete approval details are unavailable."); }
        approvalDetails.TryRemove(id,out _);
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
                    if(name=="item/started"&&parameters.TryGetProperty("item",out var item)&&item.TryGetProperty("type",out var itemType)&&itemType.GetString()=="fileChange"&&item.TryGetProperty("id",out var itemId)&&item.TryGetProperty("changes",out var changes)&&changes.ValueKind==JsonValueKind.Array) {
                        if(changedFiles.Count<128) changedFiles[itemId.GetString()!]=changes.EnumerateArray().Take(20).Select(change=>Text(change,"path")).Where(path=>path is not null).Cast<string>().ToArray();
                    }
                    if(root.TryGetProperty("id",out var requestId)) {
                        if(name is "item/commandExecution/requestApproval" or "item/fileChange/requestApproval") { if(approvals.Count>=20) { await Send(new {id=requestId.Clone(),result=new {decision="decline"}}); continue; } approvals[requestId.ToString()]=requestId.Clone(); approvalDetails[requestId.ToString()]=Describe(requestId.ToString(),name,parameters); }
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
    static string? Text(JsonElement element,string name)=>element.ValueKind==JsonValueKind.Object&&element.TryGetProperty(name,out var value)&&value.ValueKind==JsonValueKind.String?value.GetString():null;
    static bool Sensitive(string value)=>System.Text.RegularExpressions.Regex.IsMatch(value,@"(?i)(?:bearer\s+|(?:password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization)\s*[:=]|\b(?:sk-|gh[pousr]_|github_pat_)[A-Za-z0-9_-]{8,}|https?://[^\s/@:]+:[^\s/@]+@)");
    PendingApproval Describe(string id,string method,JsonElement parameters) {
        var permissions=new List<string>();
        foreach(var key in new[]{"reason","grantRoot"}) if(Text(parameters,key) is {} text) permissions.Add(key+": "+text);
        if(parameters.TryGetProperty("networkApprovalContext",out var network)&&network.ValueKind==JsonValueKind.Object) { if(Text(network,"host") is {} host) permissions.Add("network host: "+host); if(Text(network,"protocol") is {} protocol) permissions.Add("network protocol: "+protocol); }
        string? summary;
        if(method=="item/commandExecution/requestApproval") summary=Text(parameters,"command");
        else { var itemId=Text(parameters,"itemId"); summary=itemId is not null&&changedFiles.TryGetValue(itemId,out var files)&&files.Length>0?string.Join("\n",files):null; }
        var redacted=summary is not null&&Sensitive(summary)||permissions.Any(Sensitive);
        var complete=!string.IsNullOrWhiteSpace(summary)&&summary.Length<=2000&&permissions.Count<=20&&permissions.All(x=>x.Length<=200)&&!redacted;
        if(redacted) { summary="Sensitive request content withheld. Decline or cancel this request."; permissions.Clear(); }
        else { summary=summary is null?"Actual request details are unavailable. Decline or cancel this request.":summary[..Math.Min(summary.Length,2000)]; permissions=permissions.Take(20).Select(x=>x[..Math.Min(x.Length,200)]).ToList(); }
        return new(id,method,summary,permissions.ToArray(),complete,redacted);
    }
    public void Dispose() { stop.Cancel(); if(!process.HasExited) process.Kill(true); process.Dispose(); stop.Dispose(); }
}
