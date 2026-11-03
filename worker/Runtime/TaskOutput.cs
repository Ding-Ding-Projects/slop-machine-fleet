using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
namespace Fleet.Worker;

public sealed record TaskOutputEvent(long Sequence,string Kind,string Content,DateTimeOffset At,string? ItemId=null,string? Stream=null,bool Truncated=false,bool Redacted=false);
public sealed record TaskOutputSnapshot(Guid TaskId,TaskOutputEvent[] Events,long NextCursor,long OldestSequence,long LatestSequence,bool Gap,bool Truncated,string? ResetReason=null);

// Output is transient, bounded and isolated from authentication and fleet events.
public sealed class TaskOutput(Guid taskId,long initialSequence=0,bool recovered=false,string? resetReason=null) {
    const int MaximumEvents=512,MaximumBytes=256*1024,MaximumContent=2048,MaximumLine=8192;
    readonly Queue<TaskOutputEvent> events=new();
    readonly Dictionary<string,StringBuilder> lines=new();
    readonly HashSet<string> suppressedItems=new();
    readonly HashSet<string> longLines=new();
    readonly HashSet<string> streamedItems=new();
    readonly object sync=new();
    static readonly JsonSerializerOptions Serialization=new(JsonSerializerDefaults.Web);
    readonly long startingSequence=initialSequence;
    long sequence=initialSequence; int bytes;
    static readonly Regex Sensitive=new(@"(?ix)(?:bearer\s+|(?:password|passwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|authorization)\s*[""']?\s*[:=]|\b(?:sk-|gh[pousr]_|github_pat_)[A-Za-z0-9_-]{6,}|-----BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY|https?://[^\s/@:]+:[^\s/@]+@|(?-i:\b[A-Z0-9]{4}-[A-Z0-9]{4,5}\b))",RegexOptions.Compiled,TimeSpan.FromMilliseconds(100));
    static readonly Regex ProtectedContext=new(@"(?i)(?:\.codex[/\\]auth\.json|\.config[/\\]gh[/\\]hosts\.yml|\.git-credentials|\.ssh[/\\]id_|(?:^|[/\\])\.env(?:\W|$)|personal[_ -]?vocabulary|private[_ -]?vocabulary|(?:device|verification|pairing|user|one.time)[_ -]?code|login/device|auth\.openai\.com|codex\s+login|gh\s+auth|remote-control\s+pair|printenv|Get-ChildItem\s+Env:)",RegexOptions.Compiled,TimeSpan.FromMilliseconds(100));
    public long LatestSequence {get {lock(sync) return sequence;}}
    public TaskOutputSnapshot Snapshot(long after,int limit) {
        if(after<0||limit is <1 or >200) throw new ArgumentException("Invalid output cursor or limit.");
        lock(sync) {
            var oldest=events.Count>0?events.Peek().Sequence:sequence+1;
            var reason=resetReason??(recovered?"worker-restarted":null);
            var gap=after<oldest-1||after>sequence||reason is not null&&after<=startingSequence;
            var selected=events.Where(entry=>entry.Sequence>after).Take(limit).ToArray();
            var next=selected.Length>0?selected[^1].Sequence:sequence;
            return new(taskId,selected,next,oldest,sequence,gap,events.Any(entry=>entry.Sequence>next),reason??(after>sequence?"cursor-ahead-of-worker":null));
        }
    }
    public void State(string state) {lock(sync) Add("state",state);}
    static string? Text(JsonElement element,string key)=>element.ValueKind==JsonValueKind.Object&&element.TryGetProperty(key,out var value)&&value.ValueKind==JsonValueKind.String?value.GetString():null;
    static string Status(JsonElement element)=>Text(element,"status") is "inProgress" or "completed" or "failed" or "declined" or "interrupted"?Text(element,"status")!:"unknown";
    public void Record(string method,JsonElement parameters) {
        if(parameters.ValueKind!=JsonValueKind.Object) return;
        lock(sync) {
            var itemId=Text(parameters,"itemId");
            switch(method) {
                case "item/agentMessage/delta": Delta("assistant",itemId,Text(parameters,"delta")); break;
                case "item/commandExecution/outputDelta": Delta("command-output",itemId,Text(parameters,"delta"),"combined"); break;
                case "item/fileChange/outputDelta": Delta("file-change",itemId,Text(parameters,"delta")); break;
                case "item/fileChange/patchUpdated": Files(parameters,itemId); break;
                case "turn/plan/updated":
                    if(Text(parameters,"explanation") is {} explanation) SafeAdd("progress",explanation);
                    if(parameters.TryGetProperty("plan",out var plan)&&plan.ValueKind==JsonValueKind.Array) foreach(var step in plan.EnumerateArray().Take(40)) if(Text(step,"step") is {} title) SafeAdd("progress",(Text(step,"status")??"unknown")+": "+title);
                    break;
                case "error":
                    if(parameters.TryGetProperty("error",out var error)) {
                        var errorCode=Text(error,"codexErrorInfo");
                        var known=errorCode is "contextWindowExceeded" or "usageLimitExceeded" or "badRequest" or "unauthorized" or "sandboxError"?errorCode:"unspecified";
                        var retry=parameters.TryGetProperty("willRetry",out var willRetry)&&willRetry.ValueKind==JsonValueKind.True;
                        Add("progress","Model request error: "+known+"; retry pending: "+retry.ToString().ToLowerInvariant());
                    }
                    break;
                case "item/permissions/requestApproval": Add("progress","A permission approval type is unsupported and was not accepted."); break;
                case "item/started": case "item/completed":
                    if(!parameters.TryGetProperty("item",out var item)||item.ValueKind!=JsonValueKind.Object) break;
                    itemId=Text(item,"id"); var type=Text(item,"type"); var complete=method=="item/completed";
                    if(type=="commandExecution") {
                        var command=Text(item,"command");
                        if(command is not null&&(ProtectedContext.IsMatch(command)||Sensitive.IsMatch(command))) Suppress(itemId);
                        if(!complete&&command is not null) SafeAdd("command",command,itemId);
                        if(complete) {
                            if(itemId is not null&&!streamedItems.Contains(itemId)&&Text(item,"aggregatedOutput") is {} output) Delta("command-output",itemId,output,"combined");
                            Flush("command-output",itemId,"combined");
                            var exit=item.TryGetProperty("exitCode",out var code)&&code.TryGetInt32(out var number)?number.ToString():"unavailable";
                            Add("result","Command "+Status(item)+"; exit code: "+exit,itemId);
                        }
                    } else if(type=="agentMessage"&&complete) {
                        if(itemId is not null&&!streamedItems.Contains(itemId)&&Text(item,"text") is {} text) Delta("assistant",itemId,text);
                        Flush("assistant",itemId);
                    } else if(type=="fileChange") {Files(item,itemId);if(complete) Flush("file-change",itemId);}
                    break;
                case "turn/completed":
                    FlushAll();
                    if(parameters.TryGetProperty("turn",out var turn)) Add("result","Turn "+Status(turn));
                    break;
                // Authentication, raw JSON-RPC, reasoning and uncorrelated process
                // notifications are never copied into task output.
            }
        }
    }
    void Files(JsonElement value,string? itemId) {
        if(!value.TryGetProperty("changes",out var changes)||changes.ValueKind!=JsonValueKind.Array) return;
        foreach(var change in changes.EnumerateArray().Take(40)) {
            var path=Text(change,"path");if(path is null) continue;
            var kind=change.TryGetProperty("kind",out var k)?Text(k,"type"):null;
            if(ProtectedContext.IsMatch(path)) {Suppress(itemId);Add("file-change","Protected file details withheld.",itemId,redacted:true);continue;}
            SafeAdd("file-change",(kind??"changed")+": "+path,itemId);
        }
    }
    void Suppress(string? itemId) {if(itemId is not null&&suppressedItems.Count<1024) suppressedItems.Add(itemId);}
    void Delta(string kind,string? itemId,string? delta,string? stream=null) {
        if(delta is null||itemId is null||itemId.Length>256) return;
        if(streamedItems.Count<1024) streamedItems.Add(itemId);
        if(suppressedItems.Contains(itemId)) {Add(kind,"Protected task output withheld.",itemId,stream,redacted:true);return;}
        var key=kind+"\0"+itemId;
        if(!lines.TryGetValue(key,out var pending)) {if(lines.Count>=64) {Add(kind,"Concurrent output buffer limit reached.",itemId,stream,truncated:true);return;} lines[key]=pending=new();}
        // Wait for complete lines so a credential split across protocol deltas is
        // checked as one value before any part is returned to the controller.
        foreach(var character in delta) {
            if(character=='\n') {
                if(!longLines.Remove(key)) SafeAdd(kind,pending.ToString()+"\n",itemId,stream);
                pending.Clear(); continue;
            }
            if(longLines.Contains(key)) continue;
            if(pending.Length>=MaximumLine) {pending.Clear();longLines.Add(key);Add(kind,"Long output line withheld after the buffer limit.",itemId,stream,truncated:true);continue;}
            pending.Append(character);
        }
    }
    void Flush(string kind,string? itemId,string? stream=null) {
        if(itemId is null) return;var key=kind+"\0"+itemId;
        if(lines.Remove(key,out var pending)&&pending.Length>0&&!longLines.Contains(key)) SafeAdd(kind,pending.ToString(),itemId,stream);
        longLines.Remove(key);
    }
    public void FlushAll() {lock(sync) foreach(var key in lines.Keys.ToArray()) {var split=key.Split('\0');Flush(split[0],split[1],split[0]=="command-output"?"combined":null);}}
    void SafeAdd(string kind,string content,string? itemId=null,string? stream=null) {
        content=Regex.Replace(content,@"\x1B(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))","");
        content=new string(content.Where(c=>!char.IsControl(c)||c is '\n' or '\t' or '\r').ToArray());
        if(itemId is not null&&suppressedItems.Contains(itemId)||Sensitive.IsMatch(content)||ProtectedContext.IsMatch(content)) {Suppress(itemId);Add(kind,"Sensitive task output withheld.",itemId,stream,redacted:true);return;}
        if(content.Length==0) return;
        for(var offset=0;offset<content.Length;offset+=MaximumContent) Add(kind,content.Substring(offset,Math.Min(MaximumContent,content.Length-offset)),itemId,stream);
    }
    void Add(string kind,string content,string? itemId=null,string? stream=null,bool truncated=false,bool redacted=false) {
        if(content.Length>MaximumContent) {content=content[..MaximumContent];truncated=true;}
        if(itemId?.Length>256) itemId=null;
        var entry=new TaskOutputEvent(++sequence,kind,content,DateTimeOffset.UtcNow,itemId,stream,truncated,redacted);
        events.Enqueue(entry);bytes+=Cost(entry);
        while(events.Count>MaximumEvents||bytes>MaximumBytes) {var removed=events.Dequeue();bytes-=Cost(removed);}
    }
    static int Cost(TaskOutputEvent entry)=>JsonSerializer.SerializeToUtf8Bytes(entry,Serialization).Length+1;
}
