// Calls func and suppresses all output to stdout and stderr unless and error occurs
export async function suppressLog(func) {
    let stdout = process.stdout.write;
    let stderr = process.stderr.write;

    let logs = [];

    process.stdout.write = function() {
        logs.push(['stdout', arguments]);
    };
    process.stderr.write = function() {
        logs.push(['stderr', arguments]);
    };

    let result;
    try {
        result = await func();
    } catch (e) {
        process.stdout.write = stdout;
        process.stderr.write = stderr;

        for (const log of logs) {
            process[log[0]].write.apply(process[log[0]], log[1]);
        }
        throw e;
    }

    process.stdout.write = stdout;
    process.stderr.write = stderr;

    return result;
}