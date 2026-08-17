import assert from "assert";

import type { ProtocolView, TreasuryPaymentDetails } from "../../harness";

interface CreatePaymentOptions {
    recipient: string;
    amountPerPeriod: bigint;
    periodLength: bigint;
    startTime: bigint;
    numPeriods: bigint;
}

type UpdatePaymentOptions = Omit<CreatePaymentOptions, "startTime">;

interface DuePayment {
    periods: bigint;
    amount: bigint;
}

function calculateDue(payment: TreasuryPaymentDetails, timestamp: bigint): DuePayment {
    if (timestamp < payment.lastPaymentTime || payment.periodsPaid >= payment.numPeriods) {
        return { periods: 0n, amount: 0n };
    }
    const elapsedPeriods = (timestamp - payment.lastPaymentTime) / payment.periodLength;
    const remainingPeriods = payment.numPeriods - payment.periodsPaid;
    const periods = elapsedPeriods < remainingPeriods ? elapsedPeriods : remainingPeriods;
    return { periods, amount: periods * payment.amountPerPeriod };
}

async function assertTerms(
    protocol: ProtocolView,
    name: string,
    options: UpdatePaymentOptions,
): Promise<void> {
    const payment = await protocol.pdao.treasury.payment(name);
    const recipient = await protocol.context.actorAddress(options.recipient);
    assert.equal(payment.recipient.toLowerCase(), recipient.toLowerCase(), "Incorrect recipient");
    assert.equal(payment.amountPerPeriod, options.amountPerPeriod, "Incorrect amount per period");
    assert.equal(payment.periodLength, options.periodLength, "Incorrect period length");
    assert.equal(payment.numPeriods, options.numPeriods, "Incorrect number of periods");
}

export async function createRecurringPaymentAndAssert(
    protocol: ProtocolView,
    name: string,
    options: CreatePaymentOptions,
): Promise<void> {
    await protocol.pdao.treasury.createRecurringPayment(name, options);
    await assertTerms(protocol, name, options);
    const payment = await protocol.pdao.treasury.payment(name);
    assert.equal(payment.lastPaymentTime, options.startTime, "Incorrect payment start time");
    assert.equal(payment.periodsPaid, 0n, "New recurring payment already has paid periods");
}

export async function updateRecurringPaymentAndAssert(
    protocol: ProtocolView,
    name: string,
    options: UpdatePaymentOptions,
): Promise<void> {
    const before = await protocol.pdao.treasury.payment(name);
    const timestamp = await protocol.time.latest();
    const due = calculateDue(before, timestamp);
    const balanceBefore = await protocol.contracts.rocketClaimDAO.getBalance(before.recipient);

    await protocol.pdao.treasury.updateRecurringPayment(name, options);

    await assertTerms(protocol, name, options);
    const after = await protocol.pdao.treasury.payment(name);
    assert.equal(
        after.periodsPaid,
        before.periodsPaid + due.periods,
        "Payment update recorded an incorrect number of paid periods",
    );
    assert.equal(
        after.lastPaymentTime,
        before.lastPaymentTime + due.periods * before.periodLength,
        "Payment update recorded an incorrect last payment time",
    );
    assert.equal(
        await protocol.contracts.rocketClaimDAO.getBalance(before.recipient) - balanceBefore,
        due.amount,
        "Payment update accrued incorrect back pay",
    );
}

export async function fundTreasuryAndAssert(
    protocol: ProtocolView,
    from: string,
    amount: bigint,
): Promise<void> {
    const [treasuryBefore, actorBefore] = await Promise.all([
        protocol.pdao.treasury.treasuryBalance(),
        protocol.tokens.rplBalance(from),
    ]);
    await protocol.tokens.mintRpl(from, amount);
    await protocol.pdao.treasury.fund(from, amount);
    assert.equal(
        await protocol.pdao.treasury.treasuryBalance() - treasuryBefore,
        amount,
        "Treasury funding delta was incorrect",
    );
    assert.equal(
        await protocol.tokens.rplBalance(from),
        actorBefore,
        "Treasury funder retained minted RPL",
    );
}

export async function payOutRecurringPaymentsAndAssert(
    protocol: ProtocolView,
    names: string[],
    options: { caller: string },
): Promise<void> {
    const timestamp = await protocol.time.latest();
    const payments = await Promise.all(names.map(name => protocol.pdao.treasury.payment(name)));
    const expectedByRecipient = new Map<string, bigint>();
    const balancesBefore = new Map<string, bigint>();
    const due = payments.map(payment => calculateDue(payment, timestamp));

    for (let index = 0; index < payments.length; index++) {
        const recipient = payments[index].recipient.toLowerCase();
        expectedByRecipient.set(
            recipient,
            (expectedByRecipient.get(recipient) ?? 0n) + due[index].amount,
        );
    }
    for (const recipient of expectedByRecipient.keys()) {
        balancesBefore.set(
            recipient,
            await protocol.contracts.rocketClaimDAO.getBalance(recipient),
        );
    }

    await protocol.pdao.treasury.payOut(names, options);

    for (const [recipient, expected] of expectedByRecipient) {
        assert.equal(
            await protocol.contracts.rocketClaimDAO.getBalance(recipient)
                - (balancesBefore.get(recipient) ?? 0n),
            expected,
            `Incorrect accrued treasury balance for ${recipient}`,
        );
    }
    for (let index = 0; index < names.length; index++) {
        const after = await protocol.pdao.treasury.payment(names[index]);
        assert.equal(
            after.periodsPaid,
            payments[index].periodsPaid + due[index].periods,
            `Incorrect periods paid for ${names[index]}`,
        );
        assert.equal(
            after.lastPaymentTime,
            payments[index].lastPaymentTime + due[index].periods * payments[index].periodLength,
            `Incorrect last payment time for ${names[index]}`,
        );
    }
}

export async function withdrawTreasuryBalanceAndAssert(
    protocol: ProtocolView,
    recipient: string,
    options: { caller: string },
): Promise<bigint> {
    const [balanceBefore, rplBefore] = await Promise.all([
        protocol.pdao.treasury.recipientBalance(recipient),
        protocol.tokens.rplBalance(recipient),
    ]);
    await protocol.pdao.treasury.withdraw(recipient, options);
    assert.equal(
        await protocol.pdao.treasury.recipientBalance(recipient),
        0n,
        "Treasury recipient balance did not clear",
    );
    assert.equal(
        await protocol.tokens.rplBalance(recipient) - rplBefore,
        balanceBefore,
        "Recipient RPL withdrawal delta was incorrect",
    );
    return balanceBefore;
}
