pragma solidity 0.4.18;

// Arithmetic library borrowed from Gnosis, thanks guys!

library Arithmetic {
    
    function mul256By256(uint a, uint b)
        public
        pure
        returns (uint ab32, uint ab1, uint ab0)
    {
        uint ahi = a >> 128;
        uint alo = a & 2**128-1;
        uint bhi = b >> 128;
        uint blo = b & 2**128-1;
        ab0 = alo * blo;
        ab1 = (ab0 >> 128) + (ahi * blo & 2**128-1) + (alo * bhi & 2**128-1);
        ab32 = (ab1 >> 128) + ahi * bhi + (ahi * blo >> 128) + (alo * bhi >> 128);
        ab1 &= 2**128-1;
        ab0 &= 2**128-1;
    }

    // I adapted this from Fast Division of Large Integers by Karl Hasselström
    // Algorithm 3.4: Divide-and-conquer division (3 by 2)
    // Karl got it from Burnikel and Ziegler and the GMP lib implementation
    function div256_128By256(uint a21, uint a0, uint b) 
        public 
        pure
        returns (uint q, uint r)
    {
        uint qhi = (a21 / b) << 128;
        a21 %= b;

        uint shift = 0;
        while(b >> shift > 0) shift++;
        shift = 256 - shift;
        a21 = (a21 << shift) + (shift > 128 ? a0 << (shift - 128) : a0 >> (128 - shift));
        a0 = (a0 << shift) & 2**128-1;
        b <<= shift;
        var (b1, b0) = (b >> 128, b & 2**128-1);

        uint rhi;
        q = a21 / b1;
        rhi = a21 % b1;

        uint rsub0 = (q & 2**128-1) * b0;
        uint rsub21 = (q >> 128) * b0 + (rsub0 >> 128);
        rsub0 &= 2**128-1;

        while(rsub21 > rhi || rsub21 == rhi && rsub0 > a0) {
            q--;
            a0 += b0;
            rhi += b1 + (a0 >> 128);
            a0 &= 2**128-1;
        }

        q += qhi;
        r = (((rhi - rsub21) << 128) + a0 - rsub0) >> shift;
    }

    function overflowResistantFraction(uint a, uint b, uint divisor)
        public 
        pure 
        returns (uint)
    {
        uint ab32_q1; uint ab1_r1; uint ab0;
        if(b <= 1 || b != 0 && a * b / b == a) {
            return a * b / divisor;
        } else {
            (ab32_q1, ab1_r1, ab0) = mul256By256(a, b);
            (ab32_q1, ab1_r1) = div256_128By256(ab32_q1, ab1_r1, divisor);
            (a, b) = div256_128By256(ab1_r1, ab0, divisor);
            return (ab32_q1 << 128) + a;
        }
    }
}
