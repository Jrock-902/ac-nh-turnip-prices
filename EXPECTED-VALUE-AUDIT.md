# Expected prices and sell/wait advice

Audited Turnip Prophet at `4c46557`, using fixtures that match the prediction engine at zero bell tolerance. The reference values use continuous draws and the game's integer price formula. Each fixture supplies its own active slot.

## Current calculation

The predictor supplies a probability and a price range for each candidate pattern and phase layout. The chart's expected price averages those range midpoints using the candidate probabilities. For sell advice the app finds the highest of the later chart values, then tells the player to wait only if that value exceeds the current offer. Sunday buy advice also uses the highest per-slot estimate across the week. [Price estimates and advice](js/predictions.js#L1007) · [Call site](js/scripts.js#L516) · [Chart series](js/chart.js#L38)

## 1. Range midpoints can misstate the mean and reverse advice

At a buy price of 100, entering Monday AM at 65 and Monday PM at 110 isolates a Small Spike. The chart gives both sides of that spike, Tuesday PM and Wednesday PM, an expected price of **169** from the 139–199 range. Each side's hidden rate is drawn between 1.4 and the shared peak rate, which itself is drawn between 1.4 and 2.0. This makes lower side prices more likely. Integrating the price probabilities gives a mean of **154.51** bells for either side. [Small Spike game rules](https://gist.github.com/Treeki/85be14d297c80c8b3c0a76375743325b) · [Current midpoint calculation](js/predictions.js#L1012)

A second fixture isolates a Fluctuating week with two independent high prices left on Saturday. With a Friday PM offer of **115**, the app says to sell because the 90–140 range has a midpoint of 115 and ties favor selling. The actual per-slot mean under the model is **115.50**, after rounding each possible price to an integer. Either Saturday slot is better in expectation even if the player must choose one in advance.

## 2. Correct slot means still produce a different decision from reassessing later

Use the same Fluctuating week with a Friday PM offer of **120**. Even with the corrected Saturday means, the current rule says to sell. A player who can check both Saturday slots and wants to maximize average proceeds should wait. On Saturday AM, sell if the price is at least 116. Otherwise take the Saturday PM offer, whose expected price is 115.50.

| Strategy available after Friday PM | Expected proceeds per turnip |
| --- | ---: |
| Commit to one Saturday slot in advance | 115.50 |
| Check Saturday AM, then sell or wait until PM | 121.75 |
| Select the higher Saturday price with advance knowledge of both | 123.83 |

For independent Saturday prices `X` and `Y`, these quantities are `max(E[X], E[Y])`, `E[max(X, E[Y])]`, and `E[max(X, Y)]`. The last quantity is the mathematical expected maximum and serves as a hindsight benchmark. An adaptive policy for earlier in the week must also account for how new prices change the pattern probabilities. [Original project discussion](https://github.com/mikebryant/ac-nh-turnip-prices/issues/226)

## 3. Two Small Spike observations share the same hidden peak

At a base price of 100, give both side prices as 180 and leave the center blank. `generate_peak_price` assigns the observations a joint likelihood of about **0.00429%** by multiplying their marginal likelihoods. Both draws share the same center rate. Averaging the product of their likelihoods conditional on that rate gives **0.01321%**, about **3.08×** the current result. This difference can affect the weighted mean when multiple candidates survive. The fixture checks the likelihood directly. [Current peak likelihood calculation](js/predictions.js#L480)

## Reproduce

Use first-time buyer **No**, previous pattern **Small Spike**, and Sunday buy price **100** for both fixtures. Enter the prices in order from Monday AM through Friday PM and leave Saturday blank for the Fluctuating fixture. For Small Spike, enter Monday only.

| Fixture | Entered prices | Current result |
| --- | --- | --- |
| Fluctuating | 112, 120, 75, 68, 59, 115, 125, 73, 67, 120 | Saturday estimates 115 and 115. At Friday PM the advice is to sell. Use 115 for the last entry to reproduce finding 1. |
| Small Spike | 65, 110 | Tuesday PM and Wednesday PM both show an estimate of 169. |

Run this from the repository root in Node to replay the Friday decisions and calculate the reference values for both patterns. The likelihood benchmark uses midpoint integration over 600,000 equally spaced peak rates.

```js
const {
  Predictor, PATTERN, compute_expected_values, find_expected_maximum,
  get_sell_buy_decision,
} = require('./js/predictions.js');

for (const offer of [115, 120]) {
  const prices = [100, 100, 112, 120, 75, 68, 59, 115, 125, 73, 67, offer, NaN, NaN];
  const rows = new Predictor(prices, false, PATTERN.SMALL_SPIKE).analyze_possibilities();
  const expected = compute_expected_values(rows);
  const { expected_maximum } = find_expected_maximum(expected, 10);
  console.log(offer, expected.slice(10), get_sell_buy_decision(offer, 9, expected_maximum, prices.length));
}

function expectation(min, max, cdf, value, offset = 0) {
  let total = 0;
  for (let price = min; price <= max; price++) {
    const mass = cdf(price + offset + 0.00001) - cdf(price + offset - 0.99999);
    total += mass * value(price);
  }
  return total;
}

const highCdf = x => Math.max(0, Math.min(1, (x - 90) / 50));
const saturdayMean = value => expectation(90, 140, highCdf, value);
const fixed = saturdayMean(price => price);
console.log({
  fixed,
  adaptive: saturdayMean(am => Math.max(am, fixed)),
  hindsight: saturdayMean(am => saturdayMean(pm => Math.max(am, pm))),
});

const sideCdf = x => {
  const t = (x - 140) / 60;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * (1 - Math.log(t));
};
console.log({ sideMean: expectation(139, 199, sideCdf, price => price, 1) });

const peak = new Predictor([], false, -1);
const given = [100, 100, 180, NaN, 180];
const engine = peak.generate_peak_price(given, [{ min: 100, max: 100 }, { min: 100, max: 100 }], 2, 1.4, 2);
const steps = 600000;
let joint = 0;
for (let i = 0; i < steps; i++) {
  const rawPeak = 140 + 60 * (i + 0.5) / steps;
  const oneSide = Math.max(0, Math.min(rawPeak, 181.00001) - 180.00001) / (rawPeak - 140);
  joint += oneSide ** 2 / steps;
}
console.log({ engine, joint });
```

## Suggested first implementation

Compute per-slot means from the existing rate distributions and the integer conversion, then weight those means by candidate probability. Use the 154.51-bell side estimate and the 115.50-bell Saturday estimate as regression cases. Correct the shared-peak likelihood with its own test so changes to candidate weights can be reviewed independently. Before changing the sell/wait rule, decide whether the advice assumes a fixed selling slot or a player who can check again and act on new information. Keep the 120-bell Friday fixture to test the chosen rule.

The browser's choice of active slot and advice on loaded historical weeks belongs to the separate clock investigation. The audit fixtures supply the active slot directly.
