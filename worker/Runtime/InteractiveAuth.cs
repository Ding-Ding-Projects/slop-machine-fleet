using System.Text.RegularExpressions;
namespace Fleet.Worker;

public interface IAuthTerminal : IDisposable {
    Task<int> Read(char[] buffer,CancellationToken cancellation);
    Task Input(string value);
    Task<int> Wait(CancellationToken cancellation);
    void Cancel();
}
public interface IInteractiveAuthRuntime {
    IAuthTerminal Open(string executable,string[] arguments);
    Task<(int Code,string Output)> Run(string executable,string[] arguments,CancellationToken cancellation);
}
public sealed class SystemInteractiveAuthRuntime : IInteractiveAuthRuntime {
    public static SystemInteractiveAuthRuntime Instance {get;}=new();
    public IAuthTerminal Open(string executable,string[] arguments)=>new PseudoTerminal(executable,arguments);
    public Task<(int Code,string Output)> Run(string executable,string[] arguments,CancellationToken cancellation)=>Commands.Run(executable,arguments,cancellation:cancellation);
}
public sealed record AuthChoice(string Value,string Label);
public sealed record AuthPrompt(Guid PromptId,string Kind,string Title,AuthChoice[] Choices,string? DefaultChoice,string[] AllowedActions);
[System.Text.Json.Serialization.JsonUnmappedMemberHandling(System.Text.Json.Serialization.JsonUnmappedMemberHandling.Disallow)]
public sealed record AuthInput(Guid SessionId,Guid PromptId,string Action,string? Choice=null);
internal sealed record PromptObservation(string? Kind,bool Unknown,string? Url,string? Code);

// Only prompts reachable with the fixed HTTPS/web command are recognized.
// Provider text stays in this bounded transient parser, never in API state.
internal sealed class AuthPromptRecognizer {
    string recent="";
    public void Reset()=>recent="";
    public PromptObservation Append(string chunk,string provider) {
        recent+=chunk;if(recent.Length>8192) recent=recent[^8192..];
        var plain=Regex.Replace(recent,"\u001b\\[[0-?]*[ -/]*[@-~]","");
        var url=Regex.Match(plain,@"https://(?:github\.com/login/device|auth\.openai\.com/[^\s\u001b]+)");
        var code=Regex.Match(plain,provider=="github"?@"First copy your one-time code:\s*([A-Z0-9]{4}-[A-Z0-9]{4,5})\b":@"\b([A-Z0-9]{4}-[A-Z0-9]{4,5})\b");
        string? kind=null;
        if(provider=="github") {
            if(Regex.IsMatch(plain,@"Authenticate Git with your GitHub credentials\?\s*\([Yy]/[Nn]\)\s*$")) kind="github-credential-helper";
            else if(Regex.IsMatch(plain,@"Press Enter to open https://github\.com/login/device in your browser\.\.\.\s*$")) kind="github-open-browser";
        }
        var unknown=kind is null&&Regex.IsMatch(plain,@"(?:^|[\r\n])\?\s+[^\r\n]{1,512}\s*$");
        return new(kind,unknown,url.Success?url.Value:null,code.Success?code.Groups[1].Value:null);
    }
    public static AuthPrompt Create(string kind)=>kind switch {
        "github-credential-helper"=>new(Guid.NewGuid(),kind,"Authenticate Git with GitHub credentials?",[new("yes","Yes"),new("no","No")],"yes",["choose","enter"]),
        "github-open-browser"=>new(Guid.NewGuid(),kind,"Continue GitHub device authentication",[],null,["enter"]),
        _=>throw new ArgumentException("Unsupported prompt.")
    };
}
