namespace Fleet.Worker;

// A small boundary permits deterministic verification of the real pairing
// consumer without starting a daemon, issuing codes or waiting on wall time.
public interface IPairingRuntime {
    DateTimeOffset UtcNow { get; }
    Task<(int Code,string Output)> Run(string executable,string[] arguments,CancellationToken cancellation);
    Task Delay(TimeSpan duration,CancellationToken cancellation);
}

public sealed class SystemPairingRuntime : IPairingRuntime {
    public static SystemPairingRuntime Instance { get; } = new();
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
    public Task<(int Code,string Output)> Run(string executable,string[] arguments,CancellationToken cancellation) => Commands.Run(executable,arguments,cancellation:cancellation);
    public Task Delay(TimeSpan duration,CancellationToken cancellation) => Task.Delay(duration,cancellation);
}
