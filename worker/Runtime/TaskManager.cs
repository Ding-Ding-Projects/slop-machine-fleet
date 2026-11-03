using System.Text.Json;
namespace Fleet.Worker;
public sealed record TaskState(Guid Id,string State,string? ThreadId=null,string? TurnId=null,string? ErrorCode=null,long OutputSequence=0);
public sealed class TaskManager : IDisposable {
    readonly WorkerSettings settings; readonly Events events; readonly SemaphoreSlim mutex=new(1,1);
    readonly Dictionary<Guid,TaskState> tasks=new(); readonly object sync=new();
    readonly Dictionary<Guid,TaskOutput> output=new();
    AppServer? server; Guid? active; bool draining; CancellationTokenSource? taskStop;
    public bool Draining { get { lock(sync) return draining; } set { lock(sync) draining=value; } }
    public TaskManager(WorkerSettings settings,Events events) {
        this.settings=settings; this.events=events;
        var folder=Path.Combine(settings.DataRoot,"tasks"); Directory.CreateDirectory(folder);
        foreach(var file in Directory.EnumerateFiles(folder,"*.json")) {
            var state=JsonSerializer.Deserialize<TaskState>(File.ReadAllText(file));
            if(state is null) continue;
            if(state.State is "starting" or "running" or "approval-pending") state=state with {State="interrupted",ErrorCode="WORKER_RESTARTED"};
            tasks[state.Id]=state; output[state.Id]=new(state.Id,state.OutputSequence,true); Save(state);
            TrimOutput(state.Id);
        }
    }
    public TaskState Get(Guid id) { lock(sync) return tasks.TryGetValue(id,out var state)?state:throw new ArgumentException("Unknown task."); }
    public TaskOutputSnapshot Output(Guid id,long after,int limit) {lock(sync) {var state=Get(id);if(!output.TryGetValue(id,out var transcript)) {output[id]=transcript=new(id,state.OutputSequence,resetReason:"worker-buffer-evicted");TrimOutput(id);}return transcript.Snapshot(after,limit);}}
    void TrimOutput(Guid preserve) {while(output.Count>32) {var evict=output.Keys.First(key=>key!=preserve&&key!=active);output.Remove(evict);}}
    public object Details(Guid id) { var state=Get(id); lock(sync) return new {state.Id,state.State,state.ThreadId,state.TurnId,state.ErrorCode,approvalRequestIds=active==id?server?.PendingApprovals??[]:[],pendingApprovals=active==id?server?.ApprovalDetails??[]:[]}; }
    static void Validate(TaskRequest request) {
        if(!Uri.TryCreate(request.RepositoryUrl,UriKind.Absolute,out var uri)||uri.Scheme!="https"||!string.IsNullOrEmpty(uri.UserInfo)||uri.Query!=""||uri.Fragment!=""||uri.Port!=443||!string.Equals(uri.Host,"github.com",StringComparison.OrdinalIgnoreCase)||!System.Text.RegularExpressions.Regex.IsMatch(uri.AbsolutePath,@"^/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?$")) throw new ArgumentException("Repository must be an ordinary GitHub HTTPS repository URL.");
        if(string.IsNullOrWhiteSpace(request.Prompt)||request.Prompt.Length>32000||request.Model?.Length>128||request.Model?.Any(char.IsControl)==true) throw new ArgumentException("Invalid task input.");
    }
    public async Task<TaskState> Start(TaskRequest request) {
        Validate(request); await mutex.WaitAsync();
        try {
            lock(sync) { if(draining||active.HasValue) throw new InvalidOperationException("Worker is not accepting work."); if(request.Id.HasValue&&tasks.TryGetValue(request.Id.Value,out var existing)) return existing; active=request.Id??Guid.NewGuid(); }
            var id=active.Value; taskStop=new CancellationTokenSource(); lock(sync) {output[id]=new(id);TrimOutput(id);} Set(new(id,"starting"));
            _=Execute(id,request); return Get(id);
        } finally { mutex.Release(); }
    }
    async Task Execute(Guid id,TaskRequest request) {
        var cancellation=taskStop!.Token;
        AppServer? session=null;
        try {
            var root=SafePath("repositories",id.ToString("N")); var checkout=SafePath("worktrees",id.ToString("N"));
            Directory.CreateDirectory(Path.GetDirectoryName(root)!); Directory.CreateDirectory(Path.GetDirectoryName(checkout)!);
            if((await Commands.Run(settings.GitPath,["-c","credential.interactive=false","-c","http.followRedirects=false","clone","--no-checkout","--",request.RepositoryUrl,root],cancellation:cancellation)).Code!=0) throw new InvalidOperationException("Clone failed.");
            cancellation.ThrowIfCancellationRequested();
            if((await Commands.Run(settings.GitPath,["worktree","add","-b",$"fleet/task-{id:N}",checkout,"HEAD"],root,cancellation)).Code!=0) throw new InvalidOperationException("Worktree creation failed.");
            lock(sync) { if(Get(id).State=="cancelled") return; server?.Dispose(); session=new(settings.CodexPath,checkout); server=session; }
            session.Notification+=(method,parameters)=>OnNotification(id,method,parameters);
            session.Exited+=()=> { lock(sync) { if(tasks[id].State is "running" or "approval-pending" or "starting") { Set(tasks[id] with {State="interrupted",ErrorCode="APP_SERVER_ENDED"}); if(active==id) active=null; } } };
            await session.Initialize();
            cancellation.ThrowIfCancellationRequested();
            var thread=await session.Call("thread/start",new {cwd=checkout,model=request.Model,approvalPolicy="on-request",sandbox="workspace-write"});
            var threadId=thread.GetProperty("thread").GetProperty("id").GetString()!;
            cancellation.ThrowIfCancellationRequested();
            lock(sync) { if(active!=id||tasks[id].State=="cancelled") return; Set(new(id,"running",threadId)); }
            var turn=await session.Call("turn/start",new {threadId,input=new[]{new {type="text",text=request.Prompt}}});
            lock(sync) { var current=tasks[id]; if(current.State is "running" or "approval-pending") Set(current with {TurnId=turn.GetProperty("turn").GetProperty("id").GetString()}); }
        } catch(Exception) { lock(sync) { if(tasks[id].State!="cancelled") Set(tasks[id] with {State="failed",ErrorCode="TASK_START_FAILED"}); if(active==id) {active=null; server=null;} session?.Dispose(); } }
    }
    string SafePath(string category,string id) {
        var root=Path.GetFullPath(settings.DataRoot); var path=Path.GetFullPath(Path.Combine(root,category,id));
        if(!path.StartsWith(root.TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("Invalid path.");
        for(var check=Path.GetDirectoryName(path);check is not null&&check.StartsWith(root,StringComparison.OrdinalIgnoreCase);check=Path.GetDirectoryName(check)) if(Directory.Exists(check)&&(File.GetAttributes(check)&FileAttributes.ReparsePoint)!=0) throw new ArgumentException("Linked paths are not allowed.");
        return path;
    }
    void OnNotification(Guid id,string method,JsonElement parameters) {
        lock(sync) {
            if(!tasks.TryGetValue(id,out var current)||current.State is "cancelled" or "completed" or "failed") return;
            if(current.ThreadId is not null&&parameters.ValueKind==JsonValueKind.Object&&parameters.TryGetProperty("threadId",out var notifiedThread)&&notifiedThread.ValueKind==JsonValueKind.String&&notifiedThread.GetString()!=current.ThreadId) return;
            output[id].Record(method,parameters);
            if(output[id].LatestSequence!=current.OutputSequence) {current=current with {OutputSequence=output[id].LatestSequence};tasks[id]=current;Save(current);}
            if(method is "item/commandExecution/requestApproval" or "item/fileChange/requestApproval") Set(current with {State="approval-pending"});
            if(method=="turn/completed") { var status=parameters.GetProperty("turn").GetProperty("status").GetString(); Set(current with {State=status=="completed"?"completed":status=="interrupted"?"cancelled":"failed"}); active=null; }
        }
    }
    public async Task Input(Guid id,string input) { var task=Get(id); if(input.Length is 0 or >32000) throw new ArgumentException("Invalid input."); if(active!=id||server is null||task.TurnId is null) throw new InvalidOperationException("Task is not active."); await server.Call("turn/steer",new {threadId=task.ThreadId,expectedTurnId=task.TurnId,input=new[]{new {type="text",text=input}}}); }
    public async Task Approve(Guid id,string requestId,string decision) { AppServer session; lock(sync) { if(active!=id||server is null) throw new InvalidOperationException("Task is not active."); session=server; } await session.Reply(requestId,decision); lock(sync) { var current=Get(id); if(active==id&&ReferenceEquals(server,session)&&current.State=="approval-pending") Set(current with {State="running"}); } }
    public async Task Cancel(Guid id) { var task=Get(id); if(active!=id) throw new InvalidOperationException("Task is not active."); taskStop?.Cancel(); try { if(server is not null&&task.TurnId is not null) await server.Call("turn/interrupt",new {threadId=task.ThreadId,turnId=task.TurnId}); } finally { lock(sync) { Set(task with {State="cancelled"}); active=null; server?.Dispose(); server=null; } } }
    void Set(TaskState state) { lock(sync) { var transcript=output[state.Id]; if(state.State is "completed" or "failed" or "cancelled" or "interrupted") transcript.FlushAll(); transcript.State(state.State);state=state with {OutputSequence=transcript.LatestSequence};tasks[state.Id]=state; Save(state); events.Add("task",state.Id,state.State); } }
    void Save(TaskState state) { var file=Path.Combine(settings.DataRoot,"tasks",$"{state.Id}.json"); File.WriteAllText(file+".tmp",JsonSerializer.Serialize(state)); File.Move(file+".tmp",file,true); }
    public void Dispose() { taskStop?.Cancel(); lock(sync) server?.Dispose(); }
}
