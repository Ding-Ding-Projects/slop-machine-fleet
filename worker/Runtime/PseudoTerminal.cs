using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
namespace Fleet.Worker;

// ConPTY retains interactive CLI semantics without a visible desktop or shell.
public sealed class PseudoTerminal : IAuthTerminal {
    IntPtr console, attributes, processHandle, threadHandle;
    readonly StreamReader reader;
    readonly StreamWriter writer;
    readonly Process process;
    public PseudoTerminal(string executable, params string[] arguments) {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException();
        if (!CreatePipe(out var inputRead, out var inputWrite, IntPtr.Zero, 0) || !CreatePipe(out var outputRead, out var outputWrite, IntPtr.Zero, 0)) throw new Win32Exception();
        try {
            Marshal.ThrowExceptionForHR(CreatePseudoConsole(new Coord { X=120,Y=30 }, inputRead, outputWrite, 0, out console));
            nuint bytes=0;
            InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref bytes);
            attributes=Marshal.AllocHGlobal((int)bytes);
            if (!InitializeProcThreadAttributeList(attributes,1,0,ref bytes) || !UpdateProcThreadAttribute(attributes,0,(IntPtr)0x00020016,console,(nuint)IntPtr.Size,IntPtr.Zero,IntPtr.Zero)) throw new Win32Exception();
            var startup=new StartupInfoEx(); startup.StartupInfo.Size=Marshal.SizeOf<StartupInfoEx>(); startup.AttributeList=attributes;
            var host=Path.Combine(AppContext.BaseDirectory,"Fleet.Worker.exe");
            var encoded=Convert.ToBase64String(System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(new[]{executable}.Concat(arguments).ToArray()));
            var command=new System.Text.StringBuilder(string.Join(" ",new[]{host,"--pty-child="+encoded}.Select(Quote)));
            if(!CreateProcess(host,command,IntPtr.Zero,IntPtr.Zero,false,0x00080000,IntPtr.Zero,null,ref startup,out var info)) throw new Win32Exception();
            processHandle=info.Process; threadHandle=info.Thread; process=Process.GetProcessById((int)info.ProcessId);
            reader=new StreamReader(new FileStream(new SafeFileHandle(outputRead,true),FileAccess.Read));
            writer=new StreamWriter(new FileStream(new SafeFileHandle(inputWrite,true),FileAccess.Write)) { AutoFlush=true };
        } catch { CloseHandle(inputWrite); CloseHandle(outputRead); DisposeNative(); throw; }
        finally { CloseHandle(inputRead); CloseHandle(outputWrite); }
    }
    static string Quote(string value) => "\"" + System.Text.RegularExpressions.Regex.Replace(value, "(\\\\*)\"", "$1$1\\\"").TrimEnd('\\') + new string('\\',value.Reverse().TakeWhile(c=>c=='\\').Count()*2) + "\"";
    public static async Task<int> RunChild(string encoded) {
        var arguments=System.Text.Json.JsonSerializer.Deserialize<string[]>(Convert.FromBase64String(encoded))??throw new ArgumentException("Invalid terminal child.");
        if(arguments.Length==0||!Path.IsPathFullyQualified(arguments[0])) throw new ArgumentException("Invalid child executable.");
        // Service hosts can have redirected standard handles. Reopen this attached
        // pseudoconsole's actual console handles rather than inheriting host pipes.
        var security=new SecurityAttributes {Length=Marshal.SizeOf<SecurityAttributes>(),Inherit=true};
        using var input=CreateFile("CONIN$",0xC0000000,3,ref security,3,0,IntPtr.Zero);
        using var output=CreateFile("CONOUT$",0xC0000000,3,ref security,3,0,IntPtr.Zero);
        if(input.IsInvalid||output.IsInvalid||!SetStdHandle(-10,input.DangerousGetHandle())||!SetStdHandle(-11,output.DangerousGetHandle())||!SetStdHandle(-12,output.DangerousGetHandle())) throw new Win32Exception();
        var info=new ProcessStartInfo(arguments[0]) {UseShellExecute=false}; foreach(var argument in arguments.Skip(1)) info.ArgumentList.Add(argument);
        using var child=Process.Start(info)??throw new InvalidOperationException("Child launch failed."); await child.WaitForExitAsync(); return child.ExitCode;
    }
    readonly System.Text.Decoder decoder=System.Text.Encoding.UTF8.GetDecoder();
    public async Task<int> Read(char[] buffer, CancellationToken token) {
        var bytes=new byte[Math.Min(buffer.Length,1024)];
        while(true) { var count=await reader.BaseStream.ReadAsync(bytes.AsMemory(),token); if(count==0) return 0; var characters=decoder.GetChars(bytes,0,count,buffer,0,false); if(characters>0) return characters; }
    }
    public Task Input(string value) => writer.WriteAsync(value);
    public async Task<int> Wait(CancellationToken token) { await process.WaitForExitAsync(token); return process.ExitCode; }
    public void Cancel() { if(!process.HasExited) process.Kill(true); }
    public void Dispose() { Cancel(); reader.Dispose(); writer.Dispose(); process.Dispose(); DisposeNative(); }
    void DisposeNative() { if(console!=IntPtr.Zero) { ClosePseudoConsole(console); console=IntPtr.Zero; } if(attributes!=IntPtr.Zero) { DeleteProcThreadAttributeList(attributes); Marshal.FreeHGlobal(attributes); attributes=IntPtr.Zero; } if(processHandle!=IntPtr.Zero) CloseHandle(processHandle); if(threadHandle!=IntPtr.Zero) CloseHandle(threadHandle); }
    [StructLayout(LayoutKind.Sequential)] struct Coord { public short X,Y; }
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct StartupInfo { public int Size; public string? Reserved,Desktop,Title; public int X,Y,XSize,YSize,XCount,YCount,Fill,Flags; public short Show,Reserved2; public IntPtr ReservedPointer,Input,Output,Error; }
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct StartupInfoEx { public StartupInfo StartupInfo; public IntPtr AttributeList; }
    [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr Process,Thread; public uint ProcessId,ThreadId; }
    [StructLayout(LayoutKind.Sequential)] struct SecurityAttributes { public int Length; public IntPtr Descriptor; [MarshalAs(UnmanagedType.Bool)] public bool Inherit; }
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFile(string name,uint access,uint sharing,ref SecurityAttributes attributes,uint disposition,uint flags,IntPtr template);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetStdHandle(int kind,IntPtr handle);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool CreatePipe(out IntPtr read,out IntPtr write,IntPtr attributes,uint size);
    [DllImport("kernel32.dll")] static extern int CreatePseudoConsole(Coord size,IntPtr input,IntPtr output,uint flags,out IntPtr console);
    [DllImport("kernel32.dll")] static extern void ClosePseudoConsole(IntPtr console);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,int flags,ref nuint size);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,nuint size,IntPtr previous,IntPtr returned);
    [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string application,System.Text.StringBuilder command,IntPtr processAttributes,IntPtr threadAttributes,bool inherit,uint flags,IntPtr environment,string? directory,[In] ref StartupInfoEx startup,out ProcessInfo info);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
}
