using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using System.Text.Json;
namespace Fleet.Worker;
public sealed record AuthState(string State,string? VerificationUrl=null,string? UserCode=null,DateTimeOffset? ExpiresAt=null,string? ErrorCode=null);
public sealed class AuthManager(WorkerSettings settings) : IDisposable {
    sealed class Session { public AuthState State=new("pending"); public CancellationTokenSource Stop=new(TimeSpan.FromMinutes(15)); public PseudoTerminal? Terminal; }
    readonly ConcurrentDictionary<string,Session> sessions=new();
    static void Validate(string provider) { if(provider is not ("codex" or "github" or "pairing")) throw new ArgumentException("Unknown provider."); }
    public AuthState Start(string provider) {
        Validate(provider);
        var session=new Session();
        if(sessions.TryGetValue(provider,out var previous)) { if(previous.State.State is "pending" or "code-issued") throw new InvalidOperationException("Authentication already exists; cancel before restarting."); sessions.TryRemove(provider,out _); }
        if(!sessions.TryAdd(provider,session)) throw new InvalidOperationException("Authentication already exists.");
        _=Run(provider,session);
        return session.State;
    }
    public AuthState Status(string provider) { Validate(provider); return sessions.TryGetValue(provider,out var session) ? session.State : new("unknown"); }
    public async Task Input(string provider,string value) {
        Validate(provider);
        if(value.Length>256 || value.Any(c=>char.IsControl(c)&&c is not '\r' and not '\n') || value.Count(c=>c=='\n')>1) throw new ArgumentException("Invalid interactive input.");
        if(!sessions.TryGetValue(provider,out var session) || session.Terminal is null || session.State.State is not ("pending" or "code-issued")) throw new InvalidOperationException("Not accepting input.");
        await session.Terminal.Input(value+"\r");
    }
    public void Cancel(string provider) { Validate(provider); if(sessions.TryGetValue(provider,out var session)) { session.State=new("cancelled"); session.Stop.Cancel(); session.Terminal?.Cancel(); } }
    async Task Run(string provider,Session session) {
        try {
            if(provider=="pairing") {
                var start=await Commands.Run(settings.CodexPath,["remote-control","start","--json"],cancellation:session.Stop.Token);
                if(start.Code!=0) { session.State=new("error",ErrorCode:"REMOTE_START_FAILED"); return; }
                var pair=await Commands.Run(settings.CodexPath,["remote-control","pair","--json"],cancellation:session.Stop.Token);
                if(pair.Code!=0) { session.State=new("error",ErrorCode:"PAIRING_FAILED"); return; }
                using var document=JsonDocument.Parse(pair.Output);
                var root=document.RootElement;
                // An issued code does not prove a remote connection.
                DateTimeOffset? expires=DateTimeOffset.TryParse(Read(root,"expires_at"),out var parsed)?parsed:null;
                session.State=new("code-issued", Read(root,"verification_url")??Read(root,"url"),Read(root,"user_code")??Read(root,"code"),expires);
                await Task.Delay(TimeSpan.FromMinutes(10),session.Stop.Token);
                session.State=new("expired"); return;
            }
            var executable=provider=="github"?settings.GhPath:settings.CodexPath;
            using var terminal=new PseudoTerminal(executable,provider=="github"?["auth","login","--hostname","github.com","--git-protocol","https","--web"]:["login","--device-auth"]);
            session.Terminal=terminal;
            var reading=Read(terminal,session);
            var exit=await terminal.Wait(session.Stop.Token);
            session.Stop.Cancel();
            try { await reading; } catch(OperationCanceledException) { }
            if(exit!=0) { session.State=new("error",ErrorCode:"LOGIN_FAILED"); return; }
            var verified=await Commands.Run(executable,provider=="github"?["auth","status","--hostname","github.com"]:["login","status"]);
            if(verified.Code!=0) { session.State=new("error",ErrorCode:"VERIFICATION_FAILED"); return; }
            if(provider=="github" && (await Commands.Run(settings.GhPath,["auth","setup-git","--hostname","github.com"])).Code!=0) { session.State=new("error",ErrorCode:"GIT_SETUP_FAILED"); return; }
            session.State=new("verified");
        } catch(OperationCanceledException) { session.State=new(session.State.State=="cancelled"?"cancelled":"expired"); }
        catch(Exception) { session.State=new("error",ErrorCode:"AUTH_PROCESS_FAILED"); }
        finally { session.Terminal=null; }
    }
    static string? Read(JsonElement value,string key)=>value.TryGetProperty(key,out var property)&&property.ValueKind==JsonValueKind.String?property.GetString():null;
    static async Task Read(PseudoTerminal terminal,Session session) {
        var buffer=new char[1024]; var recent="";
        while(true) {
            var count=await terminal.Read(buffer,session.Stop.Token); if(count==0) return;
            recent+=new string(buffer,0,count); if(recent.Length>8192) recent=recent[^8192..];
            var plain=Regex.Replace(recent,"\u001b\\[[0-?]*[ -/]*[@-~]","");
            var url=Regex.Match(plain,@"https://(?:github\.com/login/device|auth\.openai\.com/[^\s\u001b]+)");
            var code=Regex.Match(plain,@"\b[A-Z0-9]{4}-[A-Z0-9]{4,5}\b");
            if(url.Success || code.Success) session.State=new("code-issued",url.Success?url.Value:null,code.Success?code.Value:null);
        }
    }
    public void Dispose() { foreach(var provider in sessions.Keys) Cancel(provider); }
}
