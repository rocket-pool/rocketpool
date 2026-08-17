import assert from "assert";

type RevertingAction = Promise<unknown> | (() => Promise<unknown>);

function errorText(error: unknown): string {
    if (!(error instanceof Error)) return String(error);
    const details = error as Error & {
        reason?: string;
        shortMessage?: string;
    };
    return [details.message, details.shortMessage, details.reason]
        .filter((value): value is string => Boolean(value))
        .join("\n");
}

export async function expectRevert(
    action: RevertingAction,
    expectedReason?: string | RegExp,
): Promise<void> {
    let error: unknown;
    try {
        await (typeof action === "function" ? action() : action);
    } catch (caught) {
        error = caught;
    }

    assert(error !== undefined, "Expected transaction to revert");
    if (expectedReason === undefined) return;

    const message = errorText(error);
    if (typeof expectedReason === "string") {
        assert(
            message.includes(expectedReason),
            `Expected revert containing "${expectedReason}", received:\n${message}`,
        );
    } else {
        assert.match(message, expectedReason);
    }
}
