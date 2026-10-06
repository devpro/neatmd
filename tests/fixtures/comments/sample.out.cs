using System;

namespace Shop.Orders;

/// <summary>
/// Prices an order, which is read once per request and never cached across requests,
/// since the tax table may change between two calls.
/// </summary>
public class Pricer
{
    // the discount is applied before tax;
    // applying it after would charge tax on money the customer never pays,
    // and the totals would no longer match the invoice
    public decimal Price(decimal net)
    {
        var message = "this string, so it stays whole; and it is long enough to pass the limit on its own without any comment at all around it";
        return net * 1.2m; // trailing comments after code are left alone even when they are long, so the line stays exactly as it was written here
    }

    /*
     * The rounding mode is banker's rounding: the invoice system rounds the same way,
     * and a different mode would drift by a cent on every tenth order.
     */
    public decimal Round(decimal value) => Math.Round(value, 2);
}
