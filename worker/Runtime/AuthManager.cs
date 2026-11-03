using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using System.Text.Json;
namespace Fleet.Worker;
public sealed record AuthState(string State,string? VerificationUrl=null,string? UserCode=null,DateTimeOffset? ExpiresAt=null,string? ErrorCode=null,Guid? SessionId=null);
public sealed record AuthSessionInput(Guid SessionId,string Input);
public sealed class AuthManager(WorkerSettings settings,IPairingRuntime? pairingRuntime=null) : IDisposable {
    sealed class Session(string provider) { public string Provider=provider; public Guid Id=Guid.NewGuid(); public AuthState State=new("pending"); public CancellationTokenSource Stop=new(TimeSpan.FromMinutes(15)); public PseudoTerminal? Terminal; public Task Completion=Task.CompletedTask; }
    readonly ConcurrentDictionary<string,Session> sessions=new();
    readonly ConcurrentDictionary<string,SemaphoreSlim> lifecycle=new();
    readonly ConcurrentDictionary<string,object> ownership=new();
    object OwnerLock(string provider)=>ownership.GetOrAdd(provider,_=>new());
    SemaphoreSlim Lifecycle(string provider)=>lifecycle.GetOrAdd(provider,_=>new(1,1));
    static void Validate(string provider) { if(provider is not ("codex" or "github" or "pairing")) throw new ArgumentException("Unknown provider."); }
    public async Task<AuthState> Start(string provider) {
        Validate(provider);
        var gate=Lifecycle(provider);await gate.WaitAsync();
        try {
            Session? previous;lock(OwnerLock(provider)) {sessions.TryGetValue(provider,out previous);if(previous?.State.State is "pending" or "code-issued" or "input-required") throw new InvalidOperationException("Authentication already exists; cancel before restarting.");}
            if(previous is not null) {previous.Stop.Cancel();previous.Terminal?.Cancel();await previous.Completion;previous.Stop.Dispose();}
            var session=new Session(provider);session.State=session.State with {SessionId=session.Id};
            lock(OwnerLock(provider)) sessions[provider]=session;
            session.Completion=Run(provider,session);
            return Status(provider);
        } finally {gate.Release();}
    }
    internal Task Completion(string provider)=>sessions.TryGetValue(provider,out var session)?session.Completion:Task.CompletedTask;
    public AuthState Status(string provider) { Validate(provider);lock(OwnerLock(provider)) return sessions.TryGetValue(provider,out var session) ? session.State : new("unknown"); }
    public async Task Input(string provider,Guid sessionId,string value) {
        Validate(provider);
        if(value.Length>256 || value.Any(c=>char.IsControl(c)&&c is not '\r' and not '\n') || value.Count(c=>c=='\n')>1) throw new ArgumentException("Invalid interactive input.");
        var gate=Lifecycle(provider);await gate.WaitAsync();
        try {Session session;lock(OwnerLock(provider)) {if(!sessions.TryGetValue(provider,out session!)||session.Id!=sessionId||session.Terminal is null||session.State.State is not ("pending" or "code-issued")) throw new InvalidOperationException("Not accepting input for this session.");}await session.Terminal.Input(value+"\r");}
        finally {gate.Release();}
    }
    public async Task Cancel(string provider,Guid sessionId) {Validate(provider);var gate=Lifecycle(provider);await gate.WaitAsync();try {Session session;lock(OwnerLock(provider)) {if(!sessions.TryGetValue(provider,out session!)||session.Id!=sessionId) throw new InvalidOperationException("Authentication session is stale.");session.State=new("cancelled",SessionId:session.Id);}session.Stop.Cancel();session.Terminal?.Cancel();await session.Completion;}finally {gate.Release();}}
    void Set(Session session,AuthState state) {lock(OwnerLock(session.Provider)) {if(sessions.TryGetValue(session.Provider,out var owner)&&ReferenceEquals(owner,session)&&session.State.State!="cancelled") session.State=state with {SessionId=session.Id};}}
    async Task Run(string provider,Session session) {
        try {
            if(provider=="pairing") {
                var runtime=pairingRuntime??SystemPairingRuntime.Instance;
                var start=await runtime.Run(settings.CodexPath,["remote-control","start","--json"],session.Stop.Token);
                if(start.Code!=0) { Set(session,new("error",ErrorCode:"REMOTE_START_FAILED")); return; }
                var pair=await runtime.Run(settings.CodexPath,["remote-control","pair","--json"],session.Stop.Token);
                if(pair.Code!=0) { Set(session,new("error",ErrorCode:"PAIRING_FAILED")); return; }
                using var document=JsonDocument.Parse(pair.Output);
                var root=document.RootElement;
                // An issued code does not prove a remote connection.
                var paired=ParsePairing(root,runtime.UtcNow); Set(session,paired);
                if(paired.State!="code-issued"||paired.ExpiresAt is not {} expiresAt) return;
                var duration=expiresAt-runtime.UtcNow;
                if(duration>TimeSpan.Zero) await runtime.Delay(duration>TimeSpan.FromMinutes(15)?TimeSpan.FromMinutes(15):duration,session.Stop.Token);
                Set(session,new("expired")); return;
            }
            var executable=provider=="github"?settings.GhPath:settings.CodexPath;
            using var terminal=new PseudoTerminal(executable,provider=="github"?["auth","login","--hostname","github.com","--git-protocol","https","--web"]:["login","--device-auth"]);
            session.Terminal=terminal;
            using var readStop=CancellationTokenSource.CreateLinkedTokenSource(session.Stop.Token);
            var reading=Read(terminal,session,readStop.Token);
            int exit;
            try {exit=await terminal.Wait(session.Stop.Token);}
            finally {readStop.Cancel();try {await reading;}catch(OperationCanceledException){}catch(IOException){}catch(ObjectDisposedException){}}
            if(exit!=0) { Set(session,new("error",ErrorCode:"LOGIN_FAILED")); return; }
            var verified=await Commands.Run(executable,provider=="github"?["auth","status","--hostname","github.com"]:["login","status"],cancellation:session.Stop.Token);
            if(verified.Code!=0) { Set(session,new("error",ErrorCode:"VERIFICATION_FAILED")); return; }
            if(provider=="github" && (await Commands.Run(settings.GhPath,["auth","setup-git","--hostname","github.com"],cancellation:session.Stop.Token)).Code!=0) { Set(session,new("error",ErrorCode:"GIT_SETUP_FAILED")); return; }
            Set(session,new("verified"));
        } catch(OperationCanceledException) { Set(session,new("expired")); }
        catch(Exception) { Set(session,new("error",ErrorCode:"AUTH_PROCESS_FAILED")); }
        finally { session.Terminal=null; }
    }
    static string? Read(JsonElement value,string key)=>value.TryGetProperty(key,out var property)&&property.ValueKind==JsonValueKind.String?property.GetString():null;
    public static AuthState ParsePairing(JsonElement root,DateTimeOffset? now=null) {
        var code=Read(root,"manualPairingCode");
        if(string.IsNullOrWhiteSpace(code)||code.Length>128||!root.TryGetProperty("expiresAt",out var expiry)||!expiry.TryGetInt64(out var seconds)) throw new InvalidOperationException("Unsupported pairing response.");
        var at=DateTimeOffset.FromUnixTimeSeconds(seconds);
        return at<=(now??DateTimeOffset.UtcNow)?new("expired"):new("code-issued",UserCode:code,ExpiresAt:at);
    }
    async Task Read(PseudoTerminal terminal,Session session,CancellationToken cancellation) {
        var buffer=new char[1024]; var recent="";
        while(true) {
            var count=await terminal.Read(buffer,cancellation); if(count==0) return;
            recent+=new string(buffer,0,count); if(recent.Length>8192) recent=recent[^8192..];
            var plain=Regex.Replace(recent,"\u001b\\[[0-?]*[ -/]*[@-~]","");
            var url=Regex.Match(plain,@"https://(?:github\.com/login/device|auth\.openai\.com/[^\s\u001b]+)");
            var code=Regex.Match(plain,@"\b[A-Z0-9]{4}-[A-Z0-9]{4,5}\b");
            if(url.Success || code.Success) Set(session,new("code-issued",url.Success?url.Value:null,code.Success?code.Value:null));
        }
    }
    public void Dispose() {foreach(var provider in sessions.Keys) {var id=Status(provider).SessionId;if(id.HasValue) Cancel(provider,id.Value).GetAwaiter().GetResult();}}
}
