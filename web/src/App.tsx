import { useMemo, useState } from "react";
import { Bug, Coin, CropIcon, Dog, Drop, Plant, type Stage, Weed } from "./art/crops";
import { SceneBackdrop } from "./art/scene";
import { t, useLang, cropName } from "./i18n";
import type { Move } from "./chain/farm";
import { type Catalog, type FarmView, KIND_DRY, KIND_PEST, KIND_WEED, type PlotView } from "./chain/rules";
import { type Game, useGame } from "./game";

type Drawer = "seeds" | "barn" | "neighbours" | "rules" | undefined;
type Dialog = "rename" | "close" | undefined;
type VisitTool = "hand" | "weed" | "pest";

const KIND_VERB = ["verbWeed", "verbPest", "verbWater"];
/** Why a ripe plot gives a visitor nothing, by rule error code. */
const WHY_NOT: Record<number, string> = { 29: "youStole", 30: "forOwner", 31: "dogGuards" };
const num = (n: number) => n.toLocaleString("zh-CN");

function span(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s >= 3600) return `${Math.floor(s / 3600)}${t("timeH")}${Math.floor((s % 3600) / 60)}${t("timeM")}`;
  if (s >= 60) return `${Math.floor(s / 60)}${t("timeM")}${String(s % 60).padStart(2, "0")}${t("timeS")}`;
  return `${s}${t("timeS")}`;
}

function describe(move: Move, game: Game): string {
  const a = move.action;
  const at = "plot" in a ? t("plotText", { i: a.plot + 1 }) : "";
  const whose =
    move.farm === game.mine?.id
      ? ""
      : `${game.look(game.farms.find((f) => f.id === move.farm), false)?.name || t("unnamedFarm")}：`;
  switch (a.op) {
    case "buy":
      return t("dBuy", { crop: cropName(a.crop), count: a.count });
    case "plant":
      return t("dPlant", { plot: at, crop: cropName(a.crop) });
    case "harvest":
      return t("dHarvest", { plot: at });
    case "shovel":
      return t("dShovel", { plot: at });
    case "sell":
      return t("dSell", { crop: cropName(a.crop), count: a.count });
    case "expand":
      return t("dExpand");
    case "feedDog":
      return t("dFeedDog");
    case "clear":
      return `${at}${t(KIND_VERB[a.kind] ?? "")}`;
    case "rename":
      return t("dRename", { name: a.name });
    case "help":
      return t("dHelp", { who: whose, plot: at, verb: t(KIND_VERB[a.kind] ?? "") });
    case "mischief":
      return t(a.kind === KIND_WEED ? "dMischiefWeed" : "dMischiefPest", { who: whose, plot: at });
    case "steal":
      return t("dSteal", { who: whose, plot: at });
  }
}

function stageOf(plot: PlotView, now: number): Stage {
  if (plot.withered) return "withered";
  if (plot.pending) return "seed";
  if (plot.ripe) return "ripe";
  const grown = (now - plot.plantedAt) / Math.max(1, plot.duration);
  return grown < 0.12 ? "seed" : grown < 0.5 ? "sprout" : "leafy";
}

export function App() {
  const game = useGame();
  useLang(); // the whole tree re-renders when the language flips
  const [drawer, setDrawer] = useState<Drawer>();
  const [dialog, setDialog] = useState<Dialog>();
  const [seed, setSeed] = useState(1);
  const [tool, setTool] = useState<VisitTool>("hand");

  if (game.phase.at === "loading") {
    return (
      <Shell game={game}>
        <div className="boot">
          <div className="boot-art">
            <Plant crop={6} stage="sprout" />
          </div>
          <p className="boot-text">{t("bootText")}</p>
          <div className="boot-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </div>
      </Shell>
    );
  }
  if (game.phase.at === "broken") {
    return (
      <Shell game={game}>
        <div className="card notice-card">
          <div className="notice-art" aria-hidden="true">
            <Plant crop={6} stage="withered" />
          </div>
          <h2>{game.phase.why}</h2>
          {game.phase.hint && <p>{game.phase.hint}</p>}
          <button className="btn big" onClick={() => location.reload()}>
            {t("reload")}
          </button>
        </div>
      </Shell>
    );
  }
  const catalog = game.catalog!;
  if (!game.mine) {
    return (
      <Shell game={game}>
        <Claim game={game} />
      </Shell>
    );
  }

  const mine = game.look(game.mine, true)!;
  const away = game.visited ? game.look(game.visited, true) : undefined;
  const shown = away ?? mine;
  const me = (action: Move["action"]): Move => ({ farm: game.mine!.id, action });
  const them = (action: Move["action"]): Move => ({ farm: game.visited!.id, action });

  /** Plants `seed` on the plots, buying what the bag is short of and the purse allows. */
  const sow = (plots: number[]) => {
    const info = catalog.crops[seed - 1];
    const have = mine.seeds[seed - 1];
    const buy = Math.min(Math.max(0, plots.length - have), Math.floor(mine.gold / info.seedPrice));
    const count = Math.min(plots.length, have + buy);
    if (count === 0) return game.toast("bad", t("notEnoughGoldSeeds", { crop: cropName(seed) }));
    const moves: Move[] = buy > 0 ? [me({ op: "buy", crop: seed, count: buy })] : [];
    plots.slice(0, count).forEach((plot) => moves.push(me({ op: "plant", plot, crop: seed })));
    game.add(...moves);
  };

  const chores = (plot: PlotView, index: number, as: "clear" | "help") =>
    plot.problems.flatMap((p, kind) => (p ? [{ op: as, plot: index, kind } as Move["action"]] : []));

  const onPlot = (index: number) => {
    const plot = shown.plots[index];
    if (away) {
      if (!plot.crop) return game.toast("info", t("emptyPlotToast"));
      const p = plot as PlotView;
      if (tool !== "hand") {
        return game.add(them({ op: "mischief", plot: index, kind: tool === "weed" ? KIND_WEED : KIND_PEST }));
      }
      if (p.steal > 0) return game.add(them({ op: "steal", plot: index }));
      const help = chores(p, index, "help");
      if (help.length) return game.add(...help.map(them));
      if (p.ripe) return game.add(them({ op: "steal", plot: index })); // says why not
      return game.toast("info", p.withered ? t("alreadyWithered") : t("nothingToHelp"));
    }
    if (!plot.crop) return sow([index]);
    const p = plot as PlotView;
    if (p.withered) return game.add(me({ op: "shovel", plot: index }));
    const fix = chores(p, index, "clear");
    if (fix.length) return game.add(...fix.map(me));
    if (p.ripe) return game.add(me({ op: "harvest", plot: index }));
    game.toast("info", p.pending ? t("pendingWait") : t("notRipeYet", { crop: cropName(p.crop), time: span(p.ripeAt - game.now) }));
  };

  const plots = shown.plots.map((plot, index) => ({ plot, index }));
  const growing = plots.filter((x) => x.plot.crop) as { plot: PlotView; index: number }[];
  const batchList: { label: string; moves: Move[] }[] = away
    ? [{ label: t("harvestAll"), moves: growing.filter((x) => x.plot.steal > 0).map((x) => them({ op: "steal", plot: x.index })) }]
    : [
        {
          label: t("harvestAll"),
          moves: growing.filter((x) => x.plot.ripe && !x.plot.problems.some(Boolean)).map((x) => me({ op: "harvest", plot: x.index })),
        },
        { label: t("tidyAll"), moves: growing.filter((x) => !x.plot.withered).flatMap((x) => chores(x.plot, x.index, "clear").map(me)) },
        { label: t("shovelAll"), moves: growing.filter((x) => x.plot.withered).map((x) => me({ op: "shovel", plot: x.index })) },
      ];
  const empty = plots.filter((x) => !x.plot.crop).map((x) => x.index);
  const next = mine.land < catalog.maxPlots ? catalog.expand[mine.land - catalog.initPlots] : undefined;

  return (
    <Shell game={game} farm={mine}>
      <main className="scene">
        <div className="sign">
          {away ? (
            <>
              <span className="sign-name">{away.name || t("unnamedFarm")}</span>
              <span className="sign-sub">{t("visiting", { level: away.level })}</span>
              <button className="btn small" onClick={() => game.visit(undefined)}>
                {t("backHome")}
              </button>
            </>
          ) : (
            <>
              <span className="sign-name">{mine.name || t("myFarmFallback")}</span>
              <button className="link" onClick={() => setDialog("rename")}>
                {t("rename")}
              </button>
            </>
          )}
        </div>

        <div className="quick">
          {batchList.map(({ label, moves }) => (
            <button key={label} className="btn small" disabled={moves.length === 0} onClick={() => game.add(...moves)}>
              {label}
              {moves.length > 0 && <b>{moves.length}</b>}
            </button>
          ))}
          {!away && (
            <button className="btn small" disabled={empty.length === 0} onClick={() => sow(empty)}>
              {t("sowAll", { crop: cropName(seed) })}
            </button>
          )}
          {away && (
            <span className="tools" role="group" aria-label={t("visitTools")}>
              {(["hand", "weed", "pest"] as const).map((k) => (
                <button key={k} className={`btn small ${tool === k ? "on" : ""}`} aria-pressed={tool === k} onClick={() => setTool(k)}>
                  {t(k === "hand" ? "toolHand" : k === "weed" ? "toolWeed" : "toolPest")}
                </button>
              ))}
            </span>
          )}
        </div>

        <div className="field">
          {plots.map(({ plot, index }) => (
            <PlotTile key={index} plot={plot} index={index} now={game.now} away={!!away} onClick={() => onPlot(index)} />
          ))}
          {!away && next && (
            <button
              className="plot locked"
              onClick={() => game.add(me({ op: "expand" }))}
              disabled={mine.level < next.level || mine.gold < next.price}
            >
              <span className="locked-flag" aria-hidden="true">
                +
              </span>
              <span className="locked-title">{t("lockedTitle")}</span>
              <span className="locked-cost">
                <Coin size={16} /> {num(next.price)}
              </span>
              <span className="locked-cost">{t("lockedLevel", { level: next.level })}</span>
            </button>
          )}
        </div>

        <Kennel farm={shown} game={game} away={!!away} catalog={catalog} onFeed={() => game.add(me({ op: "feedDog" }))} />
      </main>

      <Basket game={game} />

      <nav className="dock" aria-label="dock">
        <button className={`dock-btn ${drawer === "seeds" ? "on" : ""}`} onClick={() => setDrawer(drawer === "seeds" ? undefined : "seeds")}>
          <CropIcon id={seed} size={34} />
          <span>{t("dockSeeds")}</span>
        </button>
        <button className={`dock-btn ${drawer === "barn" ? "on" : ""}`} onClick={() => setDrawer(drawer === "barn" ? undefined : "barn")}>
          <BarnIcon />
          <span>{t("dockBarn")}</span>
          {mine.fruits.some(Boolean) && <b className="dot">{num(mine.fruits.reduce((a, b) => a + b, 0))}</b>}
        </button>
        <button
          className={`dock-btn ${drawer === "neighbours" ? "on" : ""}`}
          onClick={() => setDrawer(drawer === "neighbours" ? undefined : "neighbours")}
        >
          <FenceIcon />
          <span>{t("dockNeighbours")}</span>
          {game.farms.length > 1 && <b className="dot">{game.farms.length - 1}</b>}
        </button>
        <button className={`dock-btn ${drawer === "rules" ? "on" : ""}`} onClick={() => setDrawer(drawer === "rules" ? undefined : "rules")}>
          <BookIcon />
          <span>{t("dockRules")}</span>
        </button>
      </nav>

      {drawer && (
        <aside className="drawer" aria-label="panel">
          <button className="drawer-close" onClick={() => setDrawer(undefined)} aria-label="×">
            ×
          </button>
          {drawer === "seeds" && <Seeds catalog={catalog} farm={mine} seed={seed} pick={setSeed} />}
          {drawer === "barn" && <Barn catalog={catalog} farm={mine} sell={(crop, count) => game.add(me({ op: "sell", crop, count }))} />}
          {drawer === "neighbours" && (
            <Neighbours
              game={game}
              go={(id) => {
                game.visit(id);
                setTool("hand");
                setDrawer(undefined);
              }}
            />
          )}
          {drawer === "rules" && <Rules catalog={catalog} game={game} askClose={() => setDialog("close")} />}
        </aside>
      )}

      {dialog === "rename" && (
        <Modal title={t("renameTitle")} onClose={() => setDialog(undefined)}>
          <RenameForm
            current={mine.name}
            submit={(name) => {
              game.add(me({ op: "rename", name }));
              setDialog(undefined);
            }}
          />
        </Modal>
      )}
      {dialog === "close" && (
        <Modal title={t("closeTitle")} onClose={() => setDialog(undefined)}>
          <p className="modal-text">{t("closeText")}</p>
          <div className="modal-actions">
            <button className="btn" onClick={() => setDialog(undefined)}>
              {t("cancel")}
            </button>
            <button
              className="btn danger"
              disabled={!!game.busy}
              onClick={() => {
                game.close();
                setDialog(undefined);
              }}
            >
              {t("confirmClose")}
            </button>
          </div>
        </Modal>
      )}
    </Shell>
  );
}

function Shell({ game, farm, children }: { game: Game; farm?: FarmView; children: React.ReactNode }) {
  const [lang, setLang] = useLang();
  const ckb = game.balance === undefined ? "…" : num(Math.floor(Number(game.balance / 100_000_000n)));
  return (
    <div className="app">
      <SceneBackdrop />
      <header className="hud">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 48 48" width="30" height="30">
              <rect width="48" height="48" rx="12" fill="#7db249" stroke="#22331f" strokeWidth="3" />
              <path
                d="M24 40V22M24 26c-9 1-14-4-15-11 8-1 14 3 15 11zM24 26c9 1 14-4 15-11-8-1-14 3-15 11z"
                fill="#fffdf4"
                stroke="#22331f"
                strokeWidth="2.4"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="brand-name">垄上</span>
          <span className="brand-sub">{t("brandSub", { network: t(game.network.id === "devnet" ? "netDevnet" : game.network.id === "testnet" ? "netTestnet" : "netMainnet") })}</span>
        </div>
        {farm && (
          <div className="stats">
            <div className="level" title={`EXP ${num(farm.exp)} / ${num(farm.levelTo)}`}>
              <span className="level-n">{farm.level}</span>
              <span className="level-word">{t("levelWord")}</span>
              <span className="bar">
                <i style={{ width: `${(100 * (farm.exp - farm.levelFrom)) / (farm.levelTo - farm.levelFrom)}%` }} />
              </span>
            </div>
            <div className="gold" title={t("goldTitle")}>
              <Coin size={22} />
              <span>{num(farm.gold)}</span>
            </div>
          </div>
        )}
        <div className="wallet">
          <button
            className="btn small lang-toggle"
            onClick={() => setLang(lang === "zh" ? "en" : "zh")}
            aria-label={lang === "zh" ? "Switch to English" : "切换到中文"}
          >
            {lang === "zh" ? "EN" : "中文"}
          </button>
          {game.accounts.length > 0 ? (
            <label>
              <span className="sr">{t("account")}</span>
              <select value={game.accountIndex} onChange={(e) => game.setAccountIndex(Number(e.target.value))} disabled={!!game.busy}>
                {game.accounts.map((a, i) => (
                  <option key={a.key} value={i}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <button className="btn small" onClick={() => (game.wallet.connected ? game.wallet.disconnect() : game.wallet.open())}>
              {game.wallet.connected ? t("disconnectWallet") : t("connectWallet")}
            </button>
          )}
          <span className="ckb" title={game.address}>
            {ckb} CKB
          </span>
        </div>
      </header>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {game.busy && <div className="toast busy">{game.busy}</div>}
        {game.toasts.map((toastItem) => (
          <div key={toastItem.id} className={`toast ${toastItem.kind}`}>
            {toastItem.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="modal">
        <button className="drawer-close" onClick={onClose} aria-label="×">
          ×
        </button>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function RenameForm({ current, submit }: { current: string; submit: (name: string) => void }) {
  const [name, setName] = useState(current);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const clean = name.trim();
        if (clean) submit(clean);
      }}
    >
      <input className="modal-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={18} autoFocus />
      <div className="modal-actions">
        <button className="btn big" disabled={!name.trim()}>
          {t("renameBtn")}
        </button>
      </div>
    </form>
  );
}

function Claim({ game }: { game: Game }) {
  const [name, setName] = useState("");
  const poor = game.balance !== undefined && game.balance < 400n * 100_000_000n;
  const noWallet = game.accounts.length === 0 && !game.wallet.connected;
  const catalog = game.catalog;
  return (
    <form
      className="card claim"
      onSubmit={(e) => {
        e.preventDefault();
        game.create(name.trim() || "我的农场");
      }}
    >
      <div className="claim-art">
        <Plant crop={6} stage="ripe" />
      </div>
      <h1>{t("claimTitle")}</h1>
      <p>{t("claimIntro")}</p>
      {catalog && (
        <ul className="claim-facts">
          <li>
            <b>{t("factDeposit")}</b>
            <span>{t("factDepositNote")}</span>
          </li>
          <li>
            <b>{t("factGold", { gold: num(catalog.initGold) })}</b>
            <span>{t("factGoldNote")}</span>
          </li>
          <li>
            <b>{t("factPlots", { plots: catalog.initPlots })}</b>
            <span>{t("factPlotsNote", { max: catalog.maxPlots })}</span>
          </li>
        </ul>
      )}
      <label className="field-label" htmlFor="farm-name">
        {t("farmNameLabel")}
      </label>
      <input id="farm-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("myFarmFallback")} maxLength={18} autoFocus />
      {noWallet ? (
        <button className="btn big" onClick={game.wallet.open}>
          {t("connectWallet")}
        </button>
      ) : (
        <button className="btn big" disabled={!!game.busy || poor}>
          {game.busy ?? t("createFarm")}
        </button>
      )}
      {noWallet && <p className="drawer-note">{t("walletHint")}</p>}
      {!noWallet && poor && (
        <p className="warn">
          {t("poor")}
          {game.network.faucet ? (
            <a href={game.network.faucet} target="_blank" rel="noreferrer">
              {t("faucetLink")}
            </a>
          ) : (
            t("tryAnother")
          )}
          {game.address && <code>{game.address}</code>}
        </p>
      )}
    </form>
  );
}

function PlotTile({
  plot,
  index,
  now,
  away,
  onClick,
}: {
  plot: FarmView["plots"][number];
  index: number;
  now: number;
  away: boolean;
  onClick: () => void;
}) {
  if (!plot.crop) {
    return (
      <button className="plot empty" onClick={onClick} aria-label={t("plotText", { i: index + 1 })}>
        <span className="soil" />
        {!away && <span className="hint">{t("emptyHint")}</span>}
      </button>
    );
  }
  const p = plot as PlotView;
  const stage = stageOf(p, now);
  const dry = !!p.problems[KIND_DRY];
  const status = p.withered
    ? t("withered")
    : p.pending
      ? t("justSown")
      : p.ripe
        ? away
          ? p.steal > 0
            ? t("canSteal", { n: p.steal })
            : WHY_NOT[-p.steal]
              ? t(WHY_NOT[-p.steal])
              : t("ripe")
          : t("canHarvest", { n: p.harvest })
        : span(p.ripeAt - now);
  return (
    <button
      className={`plot ${stage} ${dry ? "dry" : ""} ${p.pending ? "pending" : ""}`}
      onClick={onClick}
      aria-label={t("plotText", { i: index + 1 })}
    >
      <span className="soil" />
      <Plant crop={p.crop} stage={stage} />
      <span className="pests">
        {!!p.problems[KIND_WEED] && <Weed />}
        {!!p.problems[KIND_PEST] && <Bug />}
        {dry && <Drop />}
      </span>
      {p.stolen > 0 && <span className="stolen">{t("stolen", { n: p.stolen })}</span>}
      <span className={`tag ${p.ripe ? "ripe" : ""}`}>
        <b>{cropName(p.crop)}</b>
        {status}
        {p.season > 0 && !p.withered && <i>{t("season", { n: p.season + 1 })}</i>}
      </span>
    </button>
  );
}

function Kennel({
  farm,
  game,
  away,
  catalog,
  onFeed,
}: {
  farm: FarmView;
  game: Game;
  away: boolean;
  catalog: Catalog;
  onFeed: () => void;
}) {
  const awake = farm.dogUntil > game.now;
  const can = farm.level >= catalog.dogLevel;
  return (
    <div className="kennel">
      <span className={`doghouse ${awake ? "awake" : ""}`} aria-hidden="true">
        <svg viewBox="0 0 84 78" width="72" height="67">
          <path d="M8 34L42 6l34 28" fill="#e2533f" stroke="#22331f" strokeWidth="3" strokeLinejoin="round" />
          <rect x="14" y="32" width="56" height="40" rx="4" fill="#e8c38d" stroke="#22331f" strokeWidth="3" />
          <path d="M30 72V52c0-7 5-12 12-12s12 5 12 12v20" fill="#6e4424" stroke="#22331f" strokeWidth="3" />
        </svg>
        <span className="doghouse-dog">
          <Dog awake={awake} size={46} />
        </span>
      </span>
      <div className="kennel-text">
        <b>{awake ? t("dogAwake", { time: span(farm.dogUntil - game.now) }) : t("dogHungry")}</b>
        <span>
          {away
            ? awake
              ? t("dogVisitorAwake", { percent: catalog.dogBlockPercent })
              : t("dogVisitorGone")
            : can
              ? t("dogFeedInfo", { time: span(catalog.hoursPerDay * game.chain!.unit), percent: catalog.dogBlockPercent })
              : t("dogLocked", { level: catalog.dogLevel })}
        </span>
      </div>
      {!away && (
        <button className="btn small" disabled={!can || farm.gold < catalog.dogFoodPrice} onClick={onFeed}>
          {t("feedDog")} <Coin size={14} /> {catalog.dogFoodPrice}
        </button>
      )}
    </div>
  );
}

function Basket({ game }: { game: Game }) {
  if (game.basket.length === 0) return null;
  const dropped = new Map(game.sifted?.dropped.map((d) => [d.move, d.reason]));
  const ready = game.basket.length - dropped.size;
  return (
    <section className="basket" aria-label={t("basketAria")}>
      <div className="basket-list">
        {game.basket.map((move, i) => (
          <span key={i} className={`chip ${dropped.has(move) ? "bad" : ""}`} title={dropped.get(move)}>
            {describe(move, game)}
            <button onClick={() => game.remove(i)} aria-label={t("undoOne")} disabled={!!game.busy}>
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="basket-actions">
        <button className="link" onClick={game.clear} disabled={!!game.busy}>
          {t("undoAll")}
        </button>
        <button className="btn big" onClick={() => game.send()} disabled={!!game.busy || ready === 0}>
          {game.busy ?? t("send", { n: ready })}
        </button>
      </div>
    </section>
  );
}

function Seeds({ catalog, farm, seed, pick }: { catalog: Catalog; farm: FarmView; seed: number; pick: (id: number) => void }) {
  return (
    <>
      <h2>{t("dockSeeds")}</h2>
      <p className="drawer-note">{t("seedsNote")}</p>
      <ul className="list">
        {catalog.crops.map((c) => {
          const locked = farm.level < c.level;
          return (
            <li key={c.id}>
              <button className={`row ${seed === c.id ? "on" : ""}`} disabled={locked} aria-pressed={seed === c.id} onClick={() => pick(c.id)}>
                <CropIcon id={c.id} size={44} />
                <span className="row-main">
                  <b>{cropName(c.id)}</b>
                  <span>
                    {t("growInfo", { hours: c.growHours, yield: c.yield })}
                    {c.seasons > 1 ? t("seasonsMore", { seasons: c.seasons }) : ""}
                  </span>
                  <span>{t("sellInfo", { price: c.sellPrice, exp: c.exp })}</span>
                </span>
                <span className="row-side">
                  {locked ? (
                    <i>{t("lockedUnlock", { level: c.level })}</i>
                  ) : (
                    <>
                      <span className="price">
                        <Coin size={14} /> {num(c.seedPrice)}
                      </span>
                      {farm.seeds[c.id - 1] > 0 && <i>{t("inBag", { n: farm.seeds[c.id - 1] })}</i>}
                    </>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Barn({ catalog, farm, sell }: { catalog: Catalog; farm: FarmView; sell: (crop: number, count: number) => void }) {
  const stock = catalog.crops.filter((c) => farm.fruits[c.id - 1] > 0);
  const worth = stock.reduce((sum, c) => sum + c.sellPrice * farm.fruits[c.id - 1], 0);
  return (
    <>
      <h2>{t("dockBarn")}</h2>
      {stock.length === 0 ? (
        <p className="drawer-note">{t("barnNote")}</p>
      ) : (
        <>
          <ul className="list">
            {stock.map((c) => {
              const n = farm.fruits[c.id - 1];
              return (
                <li key={c.id} className="row static">
                  <CropIcon id={c.id} size={44} />
                  <span className="row-main">
                    <b>
                      {cropName(c.id)} ×{num(n)}
                    </b>
                    <span>{t("perFruit", { price: c.sellPrice })}</span>
                  </span>
                  <button className="btn small" onClick={() => sell(c.id, n)}>
                    {t("sell")} <Coin size={14} /> {num(n * c.sellPrice)}
                  </button>
                </li>
              );
            })}
          </ul>
          <button className="btn big" onClick={() => stock.forEach((c) => sell(c.id, farm.fruits[c.id - 1]))}>
            {t("sellAll", { gold: num(worth) })}
          </button>
        </>
      )}
    </>
  );
}

function Neighbours({ game, go }: { game: Game; go: (id: string) => void }) {
  const rows = useMemo(() => {
    return game.farms
      .filter((f) => f.id !== game.mine?.id)
      .map((f) => {
        const v = game.look(f, true);
        const grown = (v?.plots.filter((p) => p.crop) ?? []) as PlotView[];
        return {
          id: f.id,
          view: v,
          loot: grown.filter((p) => p.steal > 0).length,
          trouble: grown.filter((p) => !p.withered && p.problems.some(Boolean)).length,
        };
      })
      .filter((r) => r.view)
      .sort((a, b) => b.loot - a.loot || b.trouble - a.trouble || b.view!.exp - a.view!.exp);
  }, [game]);
  return (
    <>
      <h2>{t("dockNeighbours")}</h2>
      <p className="drawer-note">{t("nbNote")}</p>
      {rows.length === 0 ? (
        <p className="drawer-note">{t("nbEmpty")}</p>
      ) : (
        <ul className="list">
          {rows.map((r) => (
            <li key={r.id}>
              <button className={`row ${game.visited?.id === r.id ? "on" : ""}`} onClick={() => go(r.id)}>
                <span className="avatar">{r.view!.level}</span>
                <span className="row-main">
                  <b>{r.view!.name || t("unnamedFarm")}</b>
                  <span>{t("nbLevelLand", { level: r.view!.level, land: r.view!.land })}</span>
                </span>
                <span className="row-side">
                  {r.loot > 0 && <i className="pill ripe">{t("pillSteal", { n: r.loot })}</i>}
                  {r.trouble > 0 && <i className="pill">{t("pillHelp", { n: r.trouble })}</i>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Rules({ catalog, game, askClose }: { catalog: Catalog; game: Game; askClose: () => void }) {
  const unit = game.chain!.unit;
  const d = game.chain!.deployment;
  return (
    <>
      <h2>{t("dockRules")}</h2>
      <div className="prose">
        <p>{t("rulesIntro")}</p>
        <ul>
          <li>{t("rulesTime", { time: span(unit), hours: catalog.hoursPerDay })}</li>
          <li>{t("rulesPlantTime")}</li>
          <li>{t("rulesProblems", { percent: catalog.problemPenaltyPercent })}</li>
          <li>{t("rulesSteal")}</li>
          <li>{t("rulesHelp", { exp: catalog.expHelp, n: catalog.helpExpPerDay })}</li>
          <li>{t("rulesMischief", { n: catalog.mischiefPerDay })}</li>
          <li>{t("rulesDog", { level: catalog.dogLevel, price: catalog.dogFoodPrice, percent: catalog.dogBlockPercent })}</li>
          <li>{t("rulesVisit")}</li>
        </ul>
        <p className="mono">
          {t("codeVersion")}
          <code>{d.codeHash}</code>
          {t("worldId")}
          <code>{d.codeScriptHash}</code>
          {t("myAddress")}
          <code>{game.address}</code>
        </p>
        <p>{t("rulesClose")}</p>
        <button className="btn small danger" disabled={!!game.busy} onClick={askClose}>
          {t("closeBtn")}
        </button>
      </div>
    </>
  );
}

const icon = { fill: "none", stroke: "#22331f", strokeWidth: 2.2, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
const BarnIcon = () => (
  <svg viewBox="0 0 36 36" width={34} height={34} aria-hidden="true">
    <path d="M5 16l13-10 13 10v15H5z" {...icon} fill="#e2533f" />
    <path d="M13 31V20h10v11M13 20l10 11M23 20L13 31" {...icon} fill="#fffdf4" />
  </svg>
);
const FenceIcon = () => (
  <svg viewBox="0 0 36 36" width={34} height={34} aria-hidden="true">
    <path d="M6 31V12l4-5 4 5v19zM22 31V12l4-5 4 5v19z" {...icon} fill="#e8c38d" />
    <path d="M14 16h8M14 25h8M2 16h4M2 25h4M30 16h4M30 25h4" {...icon} />
  </svg>
);
const BookIcon = () => (
  <svg viewBox="0 0 36 36" width={34} height={34} aria-hidden="true">
    <path d="M18 9c-4-3-9-3-13-1v20c4-2 9-2 13 1 4-3 9-3 13-1V8c-4-2-9-2-13 1z" {...icon} fill="#fffdf4" />
    <path d="M18 9v20" {...icon} />
  </svg>
);
