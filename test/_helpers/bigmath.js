export function BigMin(...args) {
    let smallest = args[0];

    for (let i = 1; i < args.length; i++) {
        if (args[i] < smallest) {
            smallest = args[i];
        }
    }

    return smallest;
}

export function BigSqrt(value) {
    if (value < 0n) {
        throw 'negative number';
    }

    if (value < 2n) {
        return value;
    }

    function newtonIteration(n, x0) {
        const x1 = ((n / x0) + x0) >> 1n;
        if (x0 === x1 || x0 === (x1 - 1n)) {
            return x0;
        }
        return newtonIteration(n, x1);
    }

    return newtonIteration(value, 1n);
}