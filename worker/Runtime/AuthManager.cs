using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using System.Text.Json;
namespace Fleet.Worker;
public sealed record AuthState(string State,string? VerificationUrl=null,string? UserCode=null,DateTimeOffset? ExpiresAt=null,string? ErrorCode=null,Guid? SessionId=null,AuthPrompt? Prompt=null,string GitSetupState="unknown");
public sealed class AuthManager(WorkerSettings settings,IPairingRuntime? pairingRuntime=null,IInteractiveAuthRuntime? interactiveRuntime=null) : IDisposable {
    sealed class Session(string provider) { public string Provider=provider; public Guid Id=Guid.NewGuid(); public AuthState State=new("pending"); public CancellationTokenSource Stop=new(TimeSpan.FromMinutes(15)); public IAuthTerminal? Terminal; public Task Completion=Task.CompletedTask; public long InputVersion; public bool? GitHelperConsent; public string GitSetupState=provider=="github"?"not-requested":"unknown"; public HashSet<string> ConsumedPrompts=[]; }
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
            var session=new Session(provider);session.State=session.State with {SessionId=session.Id,GitSetupState=session.GitSetupState};
            lock(OwnerLock(provider)) sessions[provider]=session;
            session.Completion=Run(provider,session);
            return Status(provider);
        } finally {gate.Release();}
    }
    internal Task Completion(string provider)=>sessions.TryGetValue(provider,out var session)?session.Completion:Task.CompletedTask;
    public AuthState Status(string provider) { Validate(provider);lock(OwnerLock(provider)) return sessions.TryGetValue(provider,out var session) ? session.State : new("unknown"); }
    public async Task Input(string provider,AuthInput input) {
        Validate(provider);
        if(input.SessionId==Guid.Empty||input.PromptId==Guid.Empty||input.Action is not ("choose" or "enter")||input.Choice is not (null or "yes" or "no")||input.Action=="enter"&&input.Choice is not null) throw new ArgumentException("Invalid structured authentication action.");
        var gate=Lifecycle(provider);await gate.WaitAsync();
        try {
            Session session;string value;
            lock(OwnerLock(provider)) {
                if(!sessions.TryGetValue(provider,out session!)||session.Id!=input.SessionId||session.Terminal is null||session.State.Prompt is not {} prompt||prompt.PromptId!=input.PromptId||!prompt.AllowedActions.Contains(input.Action)||session.State.State is not ("input-required" or "code-issued")) throw new InvalidOperationException("Authentication session or prompt is stale or unavailable.");
                if(input.Action=="choose") {if(input.Choice is null||!prompt.Choices.Any(choice=>choice.Value==input.Choice)) throw new ArgumentException("Choice is unavailable.");value=input.Choice=="yes"?"y\r":"n\r";}else value="\r";
                if(prompt.Kind=="github-credential-helper") {session.GitHelperConsent=input.Action=="enter"||input.Choice=="yes";session.GitSetupState=session.GitHelperConsent.Value?"not-requested":"declined";}
                session.ConsumedPrompts.Add(prompt.Kind);session.InputVersion++;session.State=session.State with {Prompt=null,State=session.State.UserCode is null?"pending":"code-issued",GitSetupState=session.GitSetupState};
            }
            try {await session.Terminal.Input(value);}catch {Set(session,new("error",ErrorCode:"AUTH_INPUT_FAILED"));throw;}
        }
        finally {gate.Release();}
    }
    public async Task<AuthState> Cancel(string provider,Guid sessionId) {Validate(provider);if(sessionId==Guid.Empty) throw new ArgumentException("Session identity is required.");var gate=Lifecycle(provider);await gate.WaitAsync();try {Session session;lock(OwnerLock(provider)) {if(!sessions.TryGetValue(provider,out session!)||session.Id!=sessionId) throw new InvalidOperationException("Authentication session is stale.");session.State=new("cancelled",SessionId:session.Id,GitSetupState:session.GitSetupState);}session.Stop.Cancel();session.Terminal?.Cancel();await session.Completion;lock(OwnerLock(provider)) return session.State;}finally {gate.Release();}}
    void Set(Session session,AuthState state) {lock(OwnerLock(session.Provider)) {if(sessions.TryGetValue(session.Provider,out var owner)&&ReferenceEquals(owner,session)&&session.State.State!="cancelled") session.State=state with {SessionId=session.Id,GitSetupState=session.GitSetupState};}}
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
            var authRuntime=interactiveRuntime??SystemInteractiveAuthRuntime.Instance;
            if(provider=="github") {var version=await authRuntime.Run(settings.GhPath,["--version"],session.Stop.Token);if(version.Code!=0||!Regex.IsMatch(version.Output,@"(?m)^gh version 2\.96\.0(?:\s|$)")) {Set(session,new("error",ErrorCode:"UNSUPPORTED_GITHUB_CLI_VERSION"));return;}}
            using var terminal=authRuntime.Open(executable,provider=="github"?["auth","login","--hostname","github.com","--git-protocol","https","--web"]:["login","--device-auth"]);
            session.Terminal=terminal;
            using var readStop=CancellationTokenSource.CreateLinkedTokenSource(session.Stop.Token);
            var reading=Read(terminal,session,readStop.Token);
            int exit;
            try {exit=await terminal.Wait(session.Stop.Token);}
            finally {readStop.Cancel();try {await reading;}catch(OperationCanceledException){}catch(IOException){}catch(ObjectDisposedException){}}
            if(exit!=0) { Set(session,new("error",ErrorCode:"LOGIN_FAILED")); return; }
            var verified=await authRuntime.Run(executable,provider=="github"?["auth","status","--hostname","github.com"]:["login","status"],session.Stop.Token);
            if(verified.Code!=0) { Set(session,new("error",ErrorCode:"VERIFICATION_FAILED")); return; }
            if(provider=="github"&&session.GitHelperConsent==true) {
                var configured=await authRuntime.Run(settings.GhPath,["auth","setup-git","--hostname","github.com"],session.Stop.Token);
                var verifiedSetup=false;
                if(configured.Code==0) {var readback=await authRuntime.Run(settings.GitPath,["config","--global","--get-all","credential.https://github.com.helper"],session.Stop.Token);verifiedSetup=readback.Code==0&&readback.Output.Replace('\\','/').Contains(settings.GhPath.Replace('\\','/'),StringComparison.OrdinalIgnoreCase)&&readback.Output.Contains("auth git-credential",StringComparison.Ordinal);}
                lock(OwnerLock(provider)) session.GitSetupState=verifiedSetup?"configured":"error";
                if(!verifiedSetup) {Set(session,new("verified",ErrorCode:"GIT_SETUP_FAILED"));return;}
            }
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
    async Task Read(IAuthTerminal terminal,Session session,CancellationToken cancellation) {
        var buffer=new char[1024];var recognizer=new AuthPromptRecognizer();long version=0;
        while(true) {
            var count=await terminal.Read(buffer,cancellation); if(count==0) return;
            long observed;lock(OwnerLock(session.Provider)) observed=session.InputVersion;
            if(version!=observed) {recognizer.Reset();version=observed;}
            var observation=recognizer.Append(new string(buffer,0,count),session.Provider);
            lock(OwnerLock(session.Provider)) {
                if(session.InputVersion!=observed||!sessions.TryGetValue(session.Provider,out var owner)||!ReferenceEquals(owner,session)||session.State.State=="cancelled") continue;
                var previous=session.State;var url=observation.Url??previous.VerificationUrl;var code=observation.Code??previous.UserCode;
                if(observation.Unknown) Set(session,new("input-required",ErrorCode:"UNSUPPORTED_AUTH_PROMPT"));
                else if(observation.Kind is {} kind&&!session.ConsumedPrompts.Contains(kind)) Set(session,new(code is null?"input-required":"code-issued",url,code,SessionId:session.Id,Prompt:previous.Prompt?.Kind==kind?previous.Prompt:AuthPromptRecognizer.Create(kind)));
                else if(observation.Url is not null||observation.Code is not null) Set(session,new("code-issued",url,code,Prompt:previous.Prompt));
            }
        }
    }
    public void Dispose() {foreach(var provider in sessions.Keys) {var id=Status(provider).SessionId;if(id.HasValue) Cancel(provider,id.Value).GetAwaiter().GetResult();}}
}
