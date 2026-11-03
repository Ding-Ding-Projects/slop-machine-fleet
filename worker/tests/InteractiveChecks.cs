using System.Text.Json;
using System.Threading.Channels;
using Fleet.Worker;

internal static class InteractiveChecks {
    public static async Task Run(WorkerSettings settings,Action<bool,string> check) {
        var runtime=new FakeInteractiveRuntime();
        using(var auth=new AuthManager(settings,interactiveRuntime:runtime)) {
            using(var initial=JsonDocument.Parse(JsonSerializer.Serialize(auth.Status("github"),new JsonSerializerOptions(JsonSerializerDefaults.Web)))) check(initial.RootElement.GetProperty("sessionId").ValueKind==JsonValueKind.Null&&initial.RootElement.GetProperty("prompt").ValueKind==JsonValueKind.Null&&initial.RootElement.GetProperty("gitSetupState").GetString()=="unknown","unknown status explicitly carries protocol identity and prompt null fields");
            var started=await auth.Start("github");
            check(started.SessionId.HasValue&&runtime.OpenArguments.SequenceEqual(new[]{"auth","login","--hostname","github.com","--git-protocol","https","--web"}),"interactive consumer uses identity and fixed HTTPS/web CLI flow");
            runtime.Terminal.Push("\u001b[2");runtime.Terminal.Push("K\r? Authenticate Git with your GitHub credentials? (Y/n) ");
            var helper=await Wait(auth,state=>state.Prompt?.Kind=="github-credential-helper");var firstPrompt=helper.Prompt!;
            check(firstPrompt.DefaultChoice=="yes"&&firstPrompt.Choices.Select(x=>x.Value).SequenceEqual(new[]{"yes","no"})&&firstPrompt.AllowedActions.SequenceEqual(new[]{"choose","enter"}),"ANSI and carriage-return chunks produce only the exact allowlisted helper prompt");
            try {await auth.Input("github",new(helper.SessionId!.Value,Guid.NewGuid(),"enter"));check(false,"stale prompt accepted");}catch(InvalidOperationException){check(runtime.Terminal.Inputs.Count==0,"stale prompt identity is rejected before writing terminal input");}
            try {await auth.Input("github",new(Guid.Empty,Guid.Empty,"enter"));check(false,"legacy input accepted");}catch(ArgumentException){check(runtime.Terminal.Inputs.Count==0,"missing legacy identities are rejected without raw input fallback");}
            try {JsonSerializer.Deserialize<AuthInput>("{\"input\":\"\\r\"}",new JsonSerializerOptions(JsonSerializerDefaults.Web));check(false,"legacy raw body accepted");}catch(JsonException){check(runtime.Terminal.Inputs.Count==0,"wire deserialization rejects legacy raw input fields before any terminal action");}
            await auth.Input("github",new(helper.SessionId!.Value,firstPrompt.PromptId,"choose","yes"));
            check(runtime.Terminal.Inputs.Single()=="y\r"&&auth.Status("github").Prompt is null,"allowlisted Yes choice writes only its fixed keystrokes and consumes the prompt");
            var beforeRedraw=runtime.Terminal.ReadCalls;
            runtime.Terminal.Push("\r? Authenticate Git with your GitHub credentials? (Y/n) ");
            using(var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(2))) while(runtime.Terminal.ReadCalls<=beforeRedraw) await Task.Delay(5,timeout.Token);
            check(auth.Status("github").Prompt is null,"a consumed prompt cannot be reactivated by terminal redraw echo");
            runtime.Terminal.Push("\rcredential_echo=synthetic-sensitive-value\r\n! First copy your one-time code: TEST-CODE\r\nPress Enter to open https://github.com/login/device in your browser... ");
            var browser=await Wait(auth,state=>state.Prompt?.Kind=="github-open-browser");
            check(browser.Prompt!.PromptId!=firstPrompt.PromptId,"the next actual browser prompt receives a distinct prompt identity");
            check(browser.State=="code-issued"&&browser.UserCode=="TEST-CODE"&&browser.Prompt!.Choices.Length==0&&browser.Prompt.DefaultChoice is null&&browser.Prompt.AllowedActions.SequenceEqual(new[]{"enter"}),"actual browser continuation keeps transient code and exposes only Enter");
            var payload=JsonSerializer.Serialize(browser,new JsonSerializerOptions(JsonSerializerDefaults.Web));
            check(!payload.Contains("synthetic-sensitive-value",StringComparison.Ordinal)&&!payload.Contains("credential_echo",StringComparison.Ordinal),"echoed sensitive-looking terminal text never enters structured API state");
            try {await auth.Input("github",new(browser.SessionId!.Value,browser.Prompt!.PromptId,"choose","yes"));check(false,"browser choice accepted");}catch(InvalidOperationException){check(runtime.Terminal.Inputs.Count==1,"browser prompt rejects a non-allowlisted choice action");}
            await auth.Input("github",new(browser.SessionId!.Value,browser.Prompt!.PromptId,"enter"));runtime.Terminal.Exit(0);await auth.Completion("github").WaitAsync(TimeSpan.FromSeconds(2));
            check(auth.Status("github").State=="verified"&&auth.Status("github").GitSetupState=="configured"&&runtime.Commands.SequenceEqual(new[]{"--version","auth status --hostname github.com","auth setup-git --hostname github.com","config --global --get-all credential.https://github.com.helper"}),"consumer verifies CLI authentication and reads back consented Git setup after terminal completion");
        }
        var unknownRuntime=new FakeInteractiveRuntime();
        using(var auth=new AuthManager(settings,interactiveRuntime:unknownRuntime)) {
            await auth.Start("github");unknownRuntime.Terminal.Push("? Select unsupported storage api_key=synthetic-sensitive-value: ");
            var state=await Wait(auth,value=>value.ErrorCode=="UNSUPPORTED_AUTH_PROMPT");
            check(state.State=="input-required"&&state.Prompt is null&&state.UserCode is null&&!JsonSerializer.Serialize(state).Contains("synthetic-sensitive-value"),"unrecognized prompt remains incomplete without exposing terminal prose");
            try {await auth.Input("github",new(state.SessionId!.Value,Guid.NewGuid(),"enter"));check(false,"unknown prompt input accepted");}catch(InvalidOperationException){check(unknownRuntime.Terminal.Inputs.Count==0,"unknown prompt cannot receive guessed Enter input");}
            var cancelled=await auth.Cancel("github",state.SessionId!.Value);
            check(cancelled.State=="cancelled"&&cancelled.SessionId==state.SessionId&&cancelled.Prompt is null,"cancel readback retains the exact settled identity and clears prompt details");
        }
        var unsupported=new FakeInteractiveRuntime {Version="gh version 99.0.0"};
        using(var auth=new AuthManager(settings,interactiveRuntime:unsupported)) {await auth.Start("github");await auth.Completion("github");check(auth.Status("github").ErrorCode=="UNSUPPORTED_GITHUB_CLI_VERSION"&&unsupported.OpenCount==0,"unsupported CLI version is incomplete before opening a terminal");}
        var declinedRuntime=new FakeInteractiveRuntime();
        using(var auth=new AuthManager(settings,interactiveRuntime:declinedRuntime)) {
            await auth.Start("github");declinedRuntime.Terminal.Push("? Authenticate Git with your GitHub credentials? (Y/n) ");
            var prompt=await Wait(auth,state=>state.Prompt is not null);await auth.Input("github",new(prompt.SessionId!.Value,prompt.Prompt!.PromptId,"choose","no"));
            declinedRuntime.Terminal.Exit(0);await auth.Completion("github").WaitAsync(TimeSpan.FromSeconds(2));
            check(auth.Status("github").State=="verified"&&auth.Status("github").GitSetupState=="declined"&&auth.Status("github").ErrorCode is null,"No choice preserves verified account authentication with separately declined Git setup");
            check(declinedRuntime.Commands.SequenceEqual(new[]{"--version","auth status --hostname github.com"}),"No choice never runs setup-git or modifies credential helper configuration afterward");
        }
        var defaultRuntime=new FakeInteractiveRuntime();
        using(var auth=new AuthManager(settings,interactiveRuntime:defaultRuntime)) {
            await auth.Start("github");defaultRuntime.Terminal.Push("? Authenticate Git with your GitHub credentials? (Y/n) ");
            var prompt=await Wait(auth,state=>state.Prompt is not null);await auth.Input("github",new(prompt.SessionId!.Value,prompt.Prompt!.PromptId,"enter"));
            check(defaultRuntime.Terminal.Inputs.Single()=="\r","explicit default-Yes sends actual Enter without any raw text");
            defaultRuntime.Terminal.Exit(0);await auth.Completion("github").WaitAsync(TimeSpan.FromSeconds(2));check(auth.Status("github").GitSetupState=="configured","explicit default-Yes permits verified setup with independent configuration readback");
        }
    }
    static async Task<AuthState> Wait(AuthManager auth,Func<AuthState,bool> predicate) {using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(2));while(true){var state=auth.Status("github");if(predicate(state)) return state;await Task.Delay(5,timeout.Token);}}
    sealed class FakeInteractiveRuntime : IInteractiveAuthRuntime {
        public string Version="gh version 2.96.0 (2026-07-02)";public int OpenCount;public string[] OpenArguments=[];public List<string> Commands=[];public FakeTerminal Terminal=new();
        public IAuthTerminal Open(string executable,string[] arguments){OpenCount++;OpenArguments=arguments;return Terminal;}
        public Task<(int Code,string Output)> Run(string executable,string[] arguments,CancellationToken cancellation){cancellation.ThrowIfCancellationRequested();Commands.Add(string.Join(" ",arguments));return Task.FromResult((0,arguments[0]=="--version"?Version:arguments[0]=="config"?"!unused-gh.exe auth git-credential":""));}
    }
    sealed class FakeTerminal : IAuthTerminal {
        readonly Channel<string> output=Channel.CreateUnbounded<string>();readonly TaskCompletionSource<int> exit=new(TaskCreationOptions.RunContinuationsAsynchronously);public List<string> Inputs=[];public int ReadCalls;
        public void Push(string text)=>output.Writer.TryWrite(text);
        public async Task<int> Read(char[] buffer,CancellationToken cancellation){Interlocked.Increment(ref ReadCalls);try{var text=await output.Reader.ReadAsync(cancellation);if(text.Length>buffer.Length)throw new InvalidOperationException("Fixture chunk exceeds terminal read size.");text.CopyTo(0,buffer,0,text.Length);return text.Length;}catch(ChannelClosedException){return 0;}}
        public Task Input(string value){Inputs.Add(value);return Task.CompletedTask;}
        public Task<int> Wait(CancellationToken cancellation)=>exit.Task.WaitAsync(cancellation);
        public void Exit(int code){exit.TrySetResult(code);output.Writer.TryComplete();}
        public void Cancel()=>Exit(-1);
        public void Dispose()=>Cancel();
    }
}
