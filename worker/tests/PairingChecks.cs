using System.Text.Json;
using Fleet.Worker;

var checks=0;
void Check(bool value,string name) {if(!value) throw new InvalidOperationException(name);checks++;Console.WriteLine("PASS "+name);}
var settings=new WorkerSettings(Guid.NewGuid().ToString(),"unused","unused","unused","unused",Path.GetTempPath(),"unused-codex.exe","unused-git.exe","unused-gh.exe");

// These fixtures drive Start -> Run -> ParsePairing -> consumer state and catch
// handling. They never start a real process or issue a provider pairing code.
var expiredRuntime=new FakePairingRuntime("{\"manualPairingCode\":\"TEST-CODE\",\"expiresAt\":1}");
using(var auth=new AuthManager(settings,expiredRuntime)) {
    await auth.Start("pairing");await auth.Completion("pairing").WaitAsync(TimeSpan.FromSeconds(2));
    var state=auth.Status("pairing");
    Check(state.State=="expired"&&state.ErrorCode is null,"Run preserves provider-expired state instead of normalizing it as process failure");
    Check(state.UserCode is null&&state.ExpiresAt is null&&expiredRuntime.DelayCalls==0,"expired consumer does not expose code or dereference or schedule a missing expiry");
    Check(expiredRuntime.Commands.SequenceEqual(new[]{"remote-control start --json","remote-control pair --json"}),"consumer uses exact production pairing command sequence");
}

var futureRuntime=new FakePairingRuntime();
futureRuntime.Response=JsonSerializer.Serialize(new {manualPairingCode="TEST-CODE",expiresAt=futureRuntime.UtcNow.AddMinutes(5).ToUnixTimeSeconds()});
using(var auth=new AuthManager(settings,futureRuntime)) {
    await auth.Start("pairing");await futureRuntime.DelayStarted.Task.WaitAsync(TimeSpan.FromSeconds(2));
    var state=auth.Status("pairing");
    Check(state.State=="code-issued"&&state.ExpiresAt==futureRuntime.UtcNow.AddMinutes(5)&&state.ErrorCode is null,"Run retains actual future expiry and code-issued state while waiting");
    Check(futureRuntime.DelayDuration==TimeSpan.FromMinutes(5),"consumer schedules only the remaining provider lifetime");
    futureRuntime.Elapse();await auth.Completion("pairing").WaitAsync(TimeSpan.FromSeconds(2));
    Check(auth.Status("pairing").State=="expired"&&auth.Status("pairing").UserCode is null,"consumer expires issued state after its scheduled lifetime without claiming connection");
}

var cancelledRuntime=new FakePairingRuntime();
cancelledRuntime.Response=JsonSerializer.Serialize(new {manualPairingCode="TEST-CODE",expiresAt=cancelledRuntime.UtcNow.AddMinutes(5).ToUnixTimeSeconds()});
using(var auth=new AuthManager(settings,cancelledRuntime)) {
    await auth.Start("pairing");await cancelledRuntime.DelayStarted.Task.WaitAsync(TimeSpan.FromSeconds(2));await auth.Cancel("pairing",auth.Status("pairing").SessionId!.Value);
    await auth.Completion("pairing").WaitAsync(TimeSpan.FromSeconds(2));
    var state=auth.Status("pairing");
    Check(cancelledRuntime.DelayCancelled&&state.State=="cancelled"&&state.ErrorCode is null&&state.UserCode is null,"Run cleanup preserves cancellation after the issued-expiry wait is cancelled");
}

foreach(var malformed in new[]{"not-json","{\"manualPairingCode\":\"TEST-CODE\"}","{\"manualPairingCode\":\"TEST-CODE\",\"expiresAt\":\"invalid\"}"}) {
    var runtime=new FakePairingRuntime(malformed);
    using var auth=new AuthManager(settings,runtime);await auth.Start("pairing");await auth.Completion("pairing").WaitAsync(TimeSpan.FromSeconds(2));
    var state=auth.Status("pairing");
    Check(state.State=="error"&&state.ErrorCode=="AUTH_PROCESS_FAILED"&&state.UserCode is null&&runtime.DelayCalls==0,"Run normalizes malformed pairing response without exposing raw output or scheduling expiry");
}
Console.WriteLine($"PASS {checks} pairing consumer checks");

var raceRuntime=new FakePairingRuntime {HoldStart=true};
raceRuntime.Response=JsonSerializer.Serialize(new {manualPairingCode="TEST-CODE",expiresAt=raceRuntime.UtcNow.AddMinutes(5).ToUnixTimeSeconds()});
using(var auth=new AuthManager(settings,raceRuntime)) {
    async Task<AuthState?> Contend() {try {return await auth.Start("pairing");}catch(InvalidOperationException){return null;}}
    var contenders=await Task.WhenAll(Task.Run(Contend),Task.Run(Contend));
    await raceRuntime.StartEntered.Task.WaitAsync(TimeSpan.FromSeconds(2));
    Check(contenders.Count(x=>x is not null)==1&&raceRuntime.Commands.Count==1,"raced Start calls retain exactly one provider owner and one command producer");
    var owner=auth.Status("pairing").SessionId!.Value;
    await auth.Cancel("pairing",owner);
    Check(auth.Status("pairing").State=="cancelled"&&auth.Completion("pairing").IsCompleted,"cancel settles the owned command producer before returning");
    raceRuntime.HoldStart=false;
    var successor=await auth.Start("pairing");
    await raceRuntime.DelayStarted.Task.WaitAsync(TimeSpan.FromSeconds(2));
    Check(successor.SessionId!=owner,"successor receives a fresh session identity after predecessor settlement");
    try {await auth.Cancel("pairing",owner);Check(false,"stale cancel accepted");}catch(InvalidOperationException){Check(auth.Status("pairing").SessionId==successor.SessionId&&auth.Status("pairing").State=="code-issued","stale cancellation cannot change the successor owner");}
    try {await auth.Input("pairing",new AuthInput(owner,Guid.NewGuid(),"enter"));Check(false,"stale input accepted");}catch(InvalidOperationException){Check(auth.Status("pairing").SessionId==successor.SessionId,"stale input cannot target a successor session");}
    await auth.Cancel("pairing",successor.SessionId!.Value);
}
Console.WriteLine($"PASS {checks} pairing and ownership checks");
await InteractiveChecks.Run(settings,Check);
Console.WriteLine($"PASS {checks} authentication consumer checks");

sealed class FakePairingRuntime(string response="") : IPairingRuntime {
    public DateTimeOffset UtcNow {get;private set;}=new(2030,1,1,0,0,0,TimeSpan.Zero);
    public string Response {get;set;}=response;
    public List<string> Commands {get;}=[];
    public bool HoldStart {get;set;}
    public TaskCompletionSource StartEntered {get;}=new(TaskCreationOptions.RunContinuationsAsynchronously);
    readonly TaskCompletionSource releaseStart=new(TaskCreationOptions.RunContinuationsAsynchronously);
    public int DelayCalls {get;private set;}
    public TimeSpan DelayDuration {get;private set;}
    public bool DelayCancelled {get;private set;}
    public TaskCompletionSource DelayStarted {get;}=new(TaskCreationOptions.RunContinuationsAsynchronously);
    readonly TaskCompletionSource elapsed=new(TaskCreationOptions.RunContinuationsAsynchronously);
    public async Task<(int Code,string Output)> Run(string executable,string[] arguments,CancellationToken cancellation) {cancellation.ThrowIfCancellationRequested();Commands.Add(string.Join(" ",arguments));if(arguments[1]=="start") {StartEntered.TrySetResult();if(HoldStart) await releaseStart.Task.WaitAsync(cancellation);}return (0,arguments[1]=="pair"?Response:"{}");}
    public async Task Delay(TimeSpan duration,CancellationToken cancellation) {DelayCalls++;DelayDuration=duration;DelayStarted.TrySetResult();try {await elapsed.Task.WaitAsync(cancellation);}catch(OperationCanceledException){DelayCancelled=true;throw;}}
    public void Elapse() {UtcNow+=DelayDuration;elapsed.TrySetResult();}
}
