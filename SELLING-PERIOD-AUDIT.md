# Device clock and in-game selling periods

Audited Turnip Prophet at `4c46557` by loading permalinks in the existing jsdom harness with a pinned browser clock. The fixtures exercise the page's price loading, current-field marker, and rendered advice.

## Which clock is used

The game uses the date and time on the Nintendo Switch or Switch 2. The app uses the browser device's local time. A moved console clock or a difference between the devices' time zones can put them in different selling periods. [Nintendo clock guidance](https://en-americas-support.nintendo.com/app/answers/detail/a_id/49516/p/988/c/950)

The app marks the current field when `scripts.js` loads. An empty marked field gets special styling and is eligible for initial scrolling. The app calculates the advice slot independently whenever the page updates. Both paths use noon to split AM from PM. The advice path treats any Sunday hour as a buying period and all Monday–Saturday hours as AM or PM, even outside the default Nook's Cranny schedule of 08:00–22:00. Island ordinances can move the opening or closing time by an hour, so the default schedule alone cannot establish whether a shop is open on a particular island. [Field marker](js/scripts.js#L2) · [Empty-field styling](css/styles.css#L510) · [Advice slot](js/scripts.js#L516) · [Default schedule](HOW-IT-WORKS.md#the-basics) · [Ordinance data](https://acnh.isomorphicbox.com/updates/2.0.0/#early-bird-ordinance)

## Reproduced behavior

Use Sunday buy price **100**, First-Time Buyer **No**, and previous pattern **Small Spike**. Enter **112, 120, 75, 68, 59, 115, 125, 73, 67, 120** in the Monday AM through Friday PM slots. These fixtures use browser-local time and exercise the existing advice policy.

| Browser time or action | Field marked current | Rendered advice |
| --- | --- | --- |
| Friday, 07:59, fresh load | Friday AM | Sell later, before regular opening |
| Friday, 12:00, fresh load | Friday PM | Sell now |
| Friday, 22:01, fresh load | Friday PM | Sell now, after regular closing |
| Open Friday at 11:59 and advance to noon | Friday AM | Sell later until the next update |
| Recalculate after that noon rollover | Friday AM | Sell now using Friday PM's 120 |
| Saturday, 15:00, with Saturday quotes 119 and 121 added | Saturday PM | No buy or sell action. The decision helper explicitly excludes the final slot. |
| Sunday, 20:00, with only the buy price entered and previous pattern unknown | Sunday buy | You should buy |

The page recomputes after changes such as a price edit, radio change, or language change. A boundary crossing alone leaves the advice as rendered on the previous update. The next update can change the quote used for advice while the previous field keeps the current-period marker. [Update triggers](js/translations.js#L57) · [Advice eligibility](js/predictions.js#L1046)

## Shared links and saved prices

The same Friday permalink generates different advice on opposite sides of noon. It carries prices and pattern settings. The saved data also carries those values without a week date or island clock. A historical week, a friend's island, and this week's entries can therefore supply the same data shape. The app also writes a permalink into the address bar during normal edits, so the presence of query parameters alone is insufficient evidence that a week is historical. [Permalink format](js/scripts.js#L567) · [Saved input](js/scripts.js#L274) · [Address bar update](js/scripts.js#L632)

## Suggested first implementation

Derive the field highlight, initial scroll, and advice from one active period. Capture time once per update and refresh the period at relevant boundaries and on tab resume. Update the highlight without moving focus after initial navigation.

Keep device time as the automatic default and offer an optional island-period selection for a console running on a different clock. Include a forecast-only option for reviewing a saved or shared week. A manual AM/PM choice can anchor the quote with one control and avoids asking for a full date or time zone. Use the regular schedule when describing automatic availability, with wording that allows for ordinances and other island-specific hours.

For a follow-up change, cover noon rollover with and without a form edit, default opening and closing, manual override, Sunday advice, the final Saturday slot, and a permalink opened at different device times. When a shared week contains observations later than a selected period, retain those entries in the forecast and decide how to withhold live advice or compute it from observations up to that period.

## Repeat the rollover check

In the `js/scripts.test.js` harness, use `setupEnvironment` with the following options, then call `initialize()` and `update()`. Inspect `input.now` and `#decision`. Change only the harness clock before repeating `update()`.

```js
const env = setupEnvironment({
  search: '?prices=100.112.120.75.68.59.115.125.73.67.120..&pattern=3',
  now: new Date(2026, 10, 13, 11, 59).getTime(),
});
env.window.initialize();
env.window.update();

env.window.Date = class extends Date {
  constructor(...args) {
    super(...(args.length ? args : [new Date(2026, 10, 13, 12).getTime()]));
  }
};
env.window.update();
// input.now still points to sell_10 (Friday AM); advice is now sell-now.
```
