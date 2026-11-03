using System.Net;
using System.Security.Cryptography.X509Certificates;
using Microsoft.AspNetCore.Server.Kestrel.Https;
using Fleet.Worker;
if(args.FirstOrDefault(x=>x.StartsWith("--pty-child=")) is {} childArguments) { Environment.ExitCode=await PseudoTerminal.RunChild(childArguments[12..]); return; }
if(args.FirstOrDefault(x=>x.StartsWith("--enroll-request=")) is {} enrollment) {
    var directory=Path.GetFullPath(enrollment[17..]); Directory.CreateDirectory(directory);
    var id=Guid.Parse(File.ReadAllText(Path.Combine(directory,"worker-id")));
    var keyPath=Path.Combine(directory,"server.key");
    using var key=System.Security.Cryptography.RSA.Create(3072);
    if(File.Exists(keyPath)) key.ImportFromPem(File.ReadAllText(keyPath));
    else File.WriteAllText(keyPath,key.ExportPkcs8PrivateKeyPem());
    var request=new System.Security.Cryptography.X509Certificates.CertificateRequest($"CN=worker-{id}",key,System.Security.Cryptography.HashAlgorithmName.SHA256,System.Security.Cryptography.RSASignaturePadding.Pkcs1);
    var san=new SubjectAlternativeNameBuilder(); san.AddDnsName($"worker-{id}"); request.CertificateExtensions.Add(san.Build());
    request.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension(new System.Security.Cryptography.OidCollection{new System.Security.Cryptography.Oid("1.3.6.1.5.5.7.3.1")},true));
    var csr=request.CreateSigningRequestPem(); File.WriteAllText(Path.Combine(directory,"server.csr"),csr);
    Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new {workerId=id,csr})); return;
}
var builder = WebApplication.CreateBuilder(args);
builder.Logging.ClearProviders();
builder.Host.UseWindowsService(options => options.ServiceName = "SlopMachineFleetWorker");
var configPath = args.FirstOrDefault(x => x.StartsWith("--worker-config="))?[16..] ?? Path.Combine(AppContext.BaseDirectory, "worker.json");
var settings = WorkerSettings.Load(configPath);
if (OperatingSystem.IsWindows() && new System.Security.Principal.WindowsPrincipal(System.Security.Principal.WindowsIdentity.GetCurrent()).IsInRole(System.Security.Principal.WindowsBuiltInRole.Administrator)) throw new InvalidOperationException("The worker must run under its dedicated non-administrator identity.");
var server = X509Certificate2.CreateFromPemFile(settings.ServerCertificate, settings.ServerKey);
server = new X509Certificate2(server.Export(X509ContentType.Pfx));
var authority = new X509Certificate2(settings.ControllerCa);
builder.WebHost.ConfigureKestrel(k => {
    k.Limits.MaxRequestBodySize = 65536;
    k.Listen(IPAddress.Loopback, 8765, listen => listen.UseHttps(new HttpsConnectionAdapterOptions {
        ServerCertificate = server, ClientCertificateMode = ClientCertificateMode.RequireCertificate,
        ClientCertificateValidation = (certificate, _, _) => CertificateTrust.Validate(certificate, authority, settings.ControllerThumbprint)
    }));
});
builder.Services.AddSingleton(settings);
builder.Services.AddSingleton<Events>();
builder.Services.AddSingleton<AuthManager>();
builder.Services.AddSingleton<TaskManager>();
var app = builder.Build();
app.Use(async (context, next) => {
    context.Response.Headers.CacheControl = "no-store";
    try { await next(context); }
    catch (ArgumentException) { context.Response.StatusCode = 400; await context.Response.WriteAsJsonAsync(new { error = new { code = "INVALID_REQUEST", message = "Request validation failed." } }); }
    catch (InvalidOperationException) { context.Response.StatusCode = 409; await context.Response.WriteAsJsonAsync(new { error = new { code = "STATE_CONFLICT", message = "Operation is not available in the current state." } }); }
    catch (Exception) { context.Response.StatusCode = 500; await context.Response.WriteAsJsonAsync(new { error = new { code = "WORKER_ERROR", message = "Worker operation failed. Inspect nonsecret status." } }); }
});
app.MapGet("/health", (TaskManager tasks) => new { workerId = settings.WorkerId, ready = !tasks.Draining, state = tasks.Draining ? "draining" : "ready", version = "0.1.0", runtime = Environment.Version.ToString() });
app.MapPost("/auth/{provider}/start", (string provider, AuthManager auth) => auth.Start(provider));
app.MapGet("/auth/{provider}", (string provider, AuthManager auth) => auth.Status(provider));
app.MapPost("/auth/{provider}/input", async (string provider, InputRequest body, AuthManager auth) => { await auth.Input(provider, body.Input); return Results.Accepted(); });
app.MapDelete("/auth/{provider}", (string provider, AuthManager auth) => { auth.Cancel(provider); return Results.NoContent(); });
app.MapPost("/tasks", async (TaskRequest request, TaskManager tasks) => Results.Accepted(value: await tasks.Start(request)));
app.MapGet("/tasks/{id:guid}", (Guid id, TaskManager tasks) => tasks.Details(id));
app.MapPost("/tasks/{id:guid}/cancel", async (Guid id, TaskManager tasks) => { await tasks.Cancel(id); return Results.Accepted(); });
app.MapPost("/tasks/{id:guid}/input", async (Guid id, InputRequest input, TaskManager tasks) => { await tasks.Input(id, input.Input); return Results.Accepted(); });
app.MapPost("/tasks/{id:guid}/approvals/{requestId}", async (Guid id, string requestId, ApprovalRequest body, TaskManager tasks) => { await tasks.Approve(id, requestId, body.Decision); return Results.Accepted(); });
app.MapPost("/drain", (TaskManager tasks) => { tasks.Draining = true; return Results.Accepted(value: new { state = "draining" }); });
app.MapGet("/events", async (HttpContext context, Events events) => {
    context.Response.ContentType = "text/event-stream";
    long.TryParse(context.Request.Headers["Last-Event-ID"], out var after);
    while (!context.RequestAborted.IsCancellationRequested) {
        foreach (var entry in events.Since(after)) { await context.Response.WriteAsync($"id: {entry.Sequence}\ndata: {System.Text.Json.JsonSerializer.Serialize(entry,new System.Text.Json.JsonSerializerOptions(System.Text.Json.JsonSerializerDefaults.Web))}\n\n", context.RequestAborted); after = entry.Sequence; }
        await context.Response.Body.FlushAsync(context.RequestAborted);
        await Task.Delay(500, context.RequestAborted);
    }
});
await app.RunAsync();
