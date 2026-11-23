/* Shared deterministic model. This classic script also loads directly from file://. */
(function (root) {
  'use strict';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const median = xs => quantile(xs, 0.5);
  function quantile(xs, q) {
    const s = [...xs].sort((a, b) => a - b);
    if (!s.length) throw new Error('No eligible token comparables');
    const i = (s.length - 1) * q, j = Math.floor(i);
    return s[j] + (s[Math.min(j + 1, s.length - 1)] - s[j]) * (i - j);
  }
  function ageDays(date, listed) {
    return listed ? Math.max(0, Math.floor((Date.parse(date) - Date.parse(listed)) / 86400000)) : null;
  }
  function valuation(p, date, peers) {
    const local = peers.filter(x => x.category === p.category);
    const ratios = peers.map(x => x.mcap_usd / x.tvl_usd);
    const cat = local.map(x => x.mcap_usd / x.tvl_usd);
    const n = local.length, weight = n / (n + 5);
    const blend = q => clamp(Math.exp(weight * Math.log(n ? quantile(cat, q) : quantile(ratios, q)) + (1 - weight) * Math.log(quantile(ratios, q))), 0.05, 5);
    const multiple = blend(0.5), age = ageDays(date, p.listed_at);
    const growth = 1 + clamp(p.change_7d ?? 0, -50, 50) / 200;
    const maturity = age === null ? 0.8 : 0.65 + 0.35 * Math.min(age, 730) / 730;
    const haircut = 0.7; // An unissued token has no observed rights or float: a 30% transfer discount.
    const value = x => Math.max(1, Math.round(p.tvl_usd * x * growth * maturity * haircut));
    return {
      implied_value_usd: value(multiple), low_usd: value(blend(0.25)) / 2 < 1 ? 1 : Math.round(value(blend(0.25)) / 2),
      high_usd: Math.round(value(blend(0.75)) * 1.5), multiple, global_median: median(ratios),
      category_median: n ? median(cat) : null, peer_count: n, weight, growth, maturity, haircut, age_days: age,
      global_count: peers.length, missing_growth: p.change_7d === null, missing_age: age === null
    };
  }
  function family(category) {
    if (/Risk Curators|Allocator|Liquidity Manager|Yield|Farm|Options Vault|Indexes/.test(category)) return 'vault';
    if (/Lending|CDP|Collateral/.test(category)) return 'credit';
    if (/Dexs/.test(category)) return 'exchange';
    if (/Derivatives|Basis Trading/.test(category)) return 'derivatives';
    if (/RWA|CeDeFi|Crypto Card/.test(category)) return 'gated';
    if (/Staking|Restaking|Restaked|Decentralized BTC/.test(category)) return 'stake';
    if (/Stablecoin/.test(category)) return 'stable';
    if (/Prediction/.test(category)) return 'prediction';
    return 'research';
  }
  function farmPlan(p, date) {
    const f = family(p.category || ''), age = ageDays(date, p.listed_at);
    const chain = p.chains[0] || 'an unreported chain';
    const capital = f === 'gated' || f === 'research' ? 0 : 200;
    const days = age === null || age < 180 ? 60 : 30;
    const gas = chain === 'Ethereum' ? 40 : 12;
    const trades = ['exchange', 'derivatives', 'prediction'].includes(f) ? 8 : 0;
    const budget = gas + trades, opportunity = capital * 0.05 * days / 365;
    const action = {
      vault: `If ${p.name} exposes an eligible public vault on ${chain}, deposit $20 of a supported asset, test redemption, then build the position to at most $200. For a curator, verify the vault's manager; do not assume it has its own deposit app.`,
      credit: `If ${p.name} offers a public supply market on ${chain}, supply $20 of a listed asset, redeem the test, then build supply to at most $200. For CDPs use a collateral deposit only if supported; do not borrow or assume USDC support.`,
      exchange: `On ${chain}, if ${p.name} has a public swap interface, execute one $20 spot swap in a liquid supported pair and reverse a $5 test. Keep the remaining $180 in your wallet; reject quotes above 0.5% price impact.`,
      derivatives: `On ${chain}, inspect ${p.name}'s margin and liquidation terms. If a public, unlevered vault exists, test $20 then cap deposits at $200. Otherwise paper-track only; the plan does not require opening leveraged trades.`,
      gated: `Request ${p.name}'s eligibility, minimum ticket, redemption and fee terms for ${chain}. Do not fund until these are verified. The snapshot has no KYC or minimum-deposit data; if access is restricted, stop at research.`,
      stake: `If ${p.name} accepts native delegation or a public deposit on ${chain}, test $20 of its supported asset and an exit before increasing to $200. Confirm lockup and slashing; do not buy a token on the assumption a new one will launch.`,
      stable: `If ${p.name} provides a public mint/redeem path on ${chain}, test $20 in both directions before increasing to $200. Confirm the supported collateral and backing; exit on failed redemption or material depeg.`,
      prediction: `If ${p.name} permits your participation on ${chain}, cap one fully collateralized position at $20, with maximum loss $20. Keep $180 outside the app. Read settlement terms; do not churn bets to manufacture activity.`,
      research: `Inspect ${p.name}'s participation route on ${chain}. The ${p.category || 'unreported'} category does not establish a deposit path or separate token issuer. Keep capital at $0 until native participation, issuer identity and eligibility are documented.`
    }[f];
    const steps = [
      `Day 0 · Verify ${p.name}'s issuer, token status and official app independently for ${chain}; the frozen record contains no contracts or URLs. Check campaign terms and supported assets. Budget: $0; 20 minutes. No points or launch is confirmed.`,
      `Day 1 · ${action} Assumed capital ceiling: $${capital}; this is a test budget, not a protocol minimum. Allow 25 minutes.`,
      `Setup and exit · Reserve $${gas} total for gas on ${chain}, plus $${trades} for trading fees/slippage where relevant. These are assumed ceilings, not measured quotes. Inspect each quote and stop if the total exceeds $${budget}; 10 minutes.`,
      `Days 2–${days} · Keep only a successfully tested position for ${days} days; review balance, access and exit liquidity once a week (10 minutes). Do not repeat paid actions unless published rules require them; research-only routes remain unfunded.`,
      capital === 0
        ? `Day ${days} · Close the research review for ${p.name} on ${chain}; record issuer evidence, access restrictions and unresolved questions. If participation is still unverified, leave capital at $0. Cost: $0; 15 minutes.`
        : `Day ${days} · If funded, redeem the test position using the verified app and revoke unused approvals where supported. Record chain, wallet, dates, transaction IDs, fees and any failed withdrawal. Budget exit gas within the $${gas} reserve; 15 minutes.`,
      `If a launch is announced · Re-check issuer and eligibility before any claim; record vesting and circulating supply. Assume zero entitlement until published terms prove it. Do not fund an unknown claim contract. Budget $0 until terms are known; 15 minutes.`
    ];
    return { family: f, chain, capital_usd: capital, duration_days: days, fee_budget_usd: budget,
      opportunity_cost_usd: opportunity, time_minutes: 85 + Math.ceil(days / 7) * 10, steps,
      status: ['gated', 'research'].includes(f) ? 'Research first' : 'Conditional pilot',
      risk: ({ vault: 'Vault loss, manager risk and exit liquidity', credit: 'Bad debt, collateral loss and withdrawal queues', exchange: 'Slippage, asset exposure and contract risk', derivatives: 'Liquidation or basis risk; no leverage in this plan', gated: 'Restricted access, counterparty and redemption risk', stake: 'Slashing, lockups and receipt depeg', stable: 'Backing, depeg and redemption risk', prediction: 'Full position loss and settlement risk', research: 'No verified participation route or separate issuer' })[f]
    };
  }
  function scenario(value, capital, tvl, fees, days, pool = 0.05, eligibility = 1) {
    // Toy capital-time share, not a probability or a confirmed points formula.
    const share = capital / (tvl + capital) * days / 90;
    const gross = value * pool * share * eligibility;
    return { share, gross, net: gross - fees - capital * 0.05 * days / 365 };
  }
  root.RadarEngine = { quantile, ageDays, valuation, family, farmPlan, scenario };
})(globalThis);
