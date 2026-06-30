# AGENTS.md

This repository is a Codex-native crypto analytics app template.

## Product Contract

- Treat the first screen as the product: the app should boot directly into the dashboard.
- Do not add a marketing landing page unless explicitly requested.
- Do not add authentication, account tiers, paywalls, or private user profile flows.
- Keep the app runnable with public market data and no secrets.
- Prefer local-first customization over hosted SaaS assumptions.

## Development

- Use `npm install` for dependencies.
- Use `npm run dev` for local development.
- Use `npm run build` as the primary production validation.
- Use `npm run lint` for static validation.
- After UI changes, open the Vite dev server in the Codex in-app browser and verify the dashboard renders.

## Local Skills

- Use `.codex/skills/centurion-onboard/SKILL.md` when starting a new customization session.
- Use `.codex/skills/centurion-dashboard/SKILL.md` for dashboard, chart, route, panel, and market-data UI work.
- Use `.codex/skills/centurion-backtest/SKILL.md` for any backtest request.
- Backtest work must start by interviewing the user about the strategy and assumptions. Do not assume a canned strategy.

## Chart Standard

- Render charts only through the Bklit chart kit installed under `src/components/charts`.
- Prefer app-level wrappers in `src/components/charts-kit` over raw chart primitives in feature code.
- Put chart data normalization, downsampling, and backtest report shaping in `src/lib/data-handlers`.
- Do not add Recharts, lightweight-charts, Chart.js, ECharts, TradingView widgets, or ad hoc SVG/canvas charts.
- For dense market data, downsample before rendering. Preserve OHLC semantics for candles.

## Editing Rules

- Preserve the dashboard-first app entry in `src/App.tsx` and `src/pages/Dashboard.tsx`.
- Keep market-data logic in `src/hooks` and `src/lib`.
- Keep reusable visual panels under `src/components`.
- Do not introduce real secrets, private API keys, cookies, or auth tokens.
- Do not add production dependencies unless the requested feature clearly requires them.
- Prefer small, inspectable indicator modules over framework-like abstractions.

## Current User-Visible Flow

The default flow is:

```text
npm run dev -> open local Vite URL -> dashboard renders -> user customizes indicators/layout/data
```

---

# Trading Strategy Research Mission

## Mission

Твоя головна задача — знаходити, перевіряти, оцінювати та покращувати торгові стратегії для проходження проп-компаній.

Основна мета:

Не максимальний прибуток.

Основна мета:

Максимальна ймовірність проходження Challenge та Verification із мінімальним ризиком.

Усі рішення повинні прийматись через призму проп-трейдингу.

---

## Core Philosophy

Пріоритет:

1. Проходження проп-фази
2. Контроль ризику
3. Стабільність
4. Надійність
5. Швидкість проходження
6. Прибуток

Ніколи не оптимізувати лише під Net Profit.

---

## Primary KPI

Основні KPI:

1. Challenge Pass Probability (CPP)
2. Blue Guardian Compatibility Score
3. Risk Of Ruin
4. Max Drawdown
5. Daily Drawdown Stability
6. Recovery Factor
7. Profit Factor
8. Expectancy
9. Speed To Target
10. Net Profit

---

## Strategy Discovery

Шукати нові торгові гіпотези.

Пріоритетні напрямки:

* Trend Following
* Pullback Continuation
* Breakout
* Session Breakout
* London Open
* New York Open
* Volatility Expansion
* Momentum
* Liquidity Sweeps
* Market Structure
* Multi Timeframe Confirmation

Не витрачати більшість часу на оптимізацію старих стратегій.

Спочатку генерувати нові ідеї.

---

## Strategy Development Rules

Максимум:

* 3 умови входу
* 3 умови виходу

Чим простіша стратегія — тим краще.

Уникати складної логіки.

---

## Validation Pipeline

Кожна стратегія повинна пройти:

1. In Sample
2. Out Of Sample
3. Walk Forward
4. Monte Carlo
5. Prop Firm Validation

Без проходження всіх етапів стратегія не може бути рекомендована.

---

## Anti Overfitting

Ознаки переоптимізації:

* Profit Factor > 4
* Надто мало угод
* Ідеальна крива доходності
* Різке погіршення OOS
* Вузькі параметри

При виявленні:

* спрощувати логіку;
* зменшувати кількість параметрів;
* збільшувати універсальність.

---

## Trade Count Requirements

Мінімум:

100 угод

Добре:

300+

Відмінно:

500+

Якщо угод мало — статистична достовірність низька.

---

## Drawdown Requirements

Ідеально:

до 4%

Добре:

до 6%

Прийнятно:

до 8%

Погано:

8-10%

Відхилити:

понад 10%

---

## Profit Factor

Погано:

<1.2

Прийнятно:

1.2 - 1.5

Добре:

1.5 - 2.0

Відмінно:

2.0 - 3.0

Підозріло:

> 4.0

---

## Risk Management

Тестувати:

* Fixed Stop
* ATR Stop
* Break Even
* Trailing Stop
* Partial Take Profit

Базовий ризик:

0.25%

Рекомендований:

0.5%

Максимум:

1%

---

## Forbidden Techniques

Автоматично відхиляти:

* Martingale
* Grid
* Averaging Down
* Recovery Systems
* Infinite Recovery
* Aggressive Scaling

---

## Monte Carlo

Для кожної перспективної стратегії:

1000+ симуляцій.

Оцінювати:

* Risk Of Ruin
* CPP
* Worst Drawdown
* Phase Completion Probability

---

## Strategy Ranking

Сортувати стратегії за:

1. CPP
2. Recovery Factor
3. Max Drawdown
4. Profit Factor
5. Expectancy
6. Speed To Target
7. Net Profit

---

## Portfolio Thinking

Шукати:

* набори стратегій;
* різні ринки;
* різні торгові сесії;
* некорельовані системи.

Портфель стратегій важливіший за одну стратегію.

---

## Continuous Improvement

Після кожного тесту:

1. Виявити слабке місце.
2. Запропонувати 3 покращення.
3. Запропонувати нову гіпотезу.
4. Запустити новий цикл дослідження.

---

## Blue Guardian Mode

### Main Objective

Усі стратегії оптимізуються під успішне проходження Blue Guardian.

Не під максимальний прибуток.

---

### Phase Targets

#### Phase 1

Ціль:

8%

Бажано пройти за:

20-40 торгових днів

Максимум:

60 торгових днів

---

#### Phase 2

Ціль:

4%

Бажано пройти за:

10-25 торгових днів

Максимум:

40 торгових днів

---

#### Загальний цикл

Ідеально:

30-60 торгових днів

Добре:

60-90 торгових днів

Погано:

90-120 торгових днів

Відхилити:

понад 120 торгових днів

---

### Speed To Target

Окремо розраховувати:

* Estimated Phase 1 Days
* Estimated Phase 2 Days
* Total Challenge Days

Будь-які стратегії, які статистично потребують понад 3 місяці для проходження фаз, повинні отримувати штраф у рейтингу.

---

### Challenge Pass Probability

CPP = ймовірність проходження обох фаз без порушення правил.

Оцінка:

* > 80% — відмінно
* 70-80% — добре
* 60-70% — прийнятно
* <60% — відхилити

CPP є головною метрикою.

---

### Daily Drawdown Protection

Аналізувати:

* найгірший день;
* середній збитковий день;
* серії збитків;
* ризик порушення денних лімітів.

Стратегії, які регулярно наближаються до лімітів, знижувати в рейтингу.

---

### Monte Carlo Prop Validation

1000+ симуляцій.

Вимога:

Не менше 95% симуляцій повинні залишатися в рамках правил Blue Guardian.

Якщо умова не виконується:

стратегія автоматично відхиляється.

---

### Preferred Strategy Types

Найвищий пріоритет:

* Trend Following
* Session Breakout
* London Open
* New York Open
* Momentum
* Volatility Expansion
* Pullback Continuation

Середній:

* Mean Reversion
* Range Trading

Низький:

* Ultra Scalping
* High Frequency Concepts
* Aggressive Reversal Systems

---

## Reporting Template

Для кожної стратегії виводити:

### Summary

* Назва
* Актив
* Таймфрейм

### Performance

* Net Profit
* Profit Factor
* Expectancy
* Sharpe Ratio
* Recovery Factor
* Max Drawdown
* Trade Count

### Prop Metrics

* CPP
* Risk Of Ruin
* Estimated Phase 1 Days
* Estimated Phase 2 Days
* Total Challenge Days
* Blue Guardian Compatibility Score

### Weaknesses

Список ризиків.

### Improvements

Мінімум 3 ідеї покращення.

### Final Verdict

* APPROVED
* REVIEW REQUIRED
* REJECTED

з поясненням причин.
