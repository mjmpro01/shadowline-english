import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { Loading } from '../components/LoadState'
import { useApp } from '../store/context'
import { gameApi, type GameState, type HarvestedWord, type Quests, type Reward } from '../game/api'
import { GameBus, type NpcId, type Target } from '../game/bus'
import { idleLine } from '../game/npcs'
import { Dialogue } from '../game/ui/Dialogue'
import { ActionButton, Hud, Joystick, Tracker } from '../game/ui/Hud'
import { BagPanel, BramPanel, HousePanel, PlotPanel, ShopPanel, WordCard } from '../game/ui/panels'
import { QuestBook } from '../game/ui/QuestBook'
import { RewardChips } from '../game/ui/common'
import { gameError } from '../game/ui/util'
import '../styles/arena.css'

type Panel =
  | { kind: 'plot'; idx: number }
  | { kind: 'talk'; who: NpcId | 'grandma' }
  | { kind: 'shop' }
  | { kind: 'bram' }
  | { kind: 'house' }
  | { kind: 'bag' }
  | { kind: 'quests'; tab: 'main' | 'daily' }
  | { kind: 'word'; word: HarvestedWord | null; gold: number }

type Game = { destroy: (removeCanvas: boolean) => void }

/**
 * The Arena: a farm where every harvest is a word.
 *
 * Phaser draws the farm and walks the player around it; this screen holds the
 * farm the server sent, opens the panels, and makes the moves. The engine is
 * imported only once this screen mounts, so no other screen downloads it.
 */
export function ArenaScreen() {
  const { t, locale } = useI18n()
  const { refreshVocab } = useApp()
  const bus = useMemo(() => new GameBus(), [])
  const holder = useRef<HTMLDivElement>(null)
  /** The engine, once it is starting: kept as a promise so a screen left
   *  before it finished starting still stops it. */
  const game = useRef<Promise<Game> | null>(null)

  const [state, setState] = useState<GameState | null>(null)
  const [quests, setQuests] = useState<Quests | null>(null)
  const [skew, setSkew] = useState(0)
  const [failed, setFailed] = useState(false)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [focus, setFocus] = useState<Target | null>(null)
  /** The scene is drawn and taking keys. */
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ text: string; reward?: Reward } | null>(null)

  const take = useCallback((next: GameState) => {
    setState(next)
    setSkew(Date.parse(next.now) - Date.now())
  }, [])

  const refreshQuests = useCallback(async () => {
    try {
      setQuests(await gameApi.quests())
    } catch {
      /* the next move refreshes them again */
    }
  }, [])

  // Load the farm, then start the engine on the spot the player left.
  const load = useCallback(async () => {
    setFailed(false)
    try {
      const [s, q] = await Promise.all([gameApi.state(), gameApi.quests()])
      take(s)
      setQuests(q)
      // A new farmer's first sight is Grandma's letter.
      if (q.main?.id === 'letter') setPanel({ kind: 'talk', who: 'grandma' })
      const parent = holder.current
      if (parent && !game.current) {
        const start = s.profile.x || s.profile.y ? { x: s.profile.x, y: s.profile.y } : null
        game.current = import('../game/createGame').then(({ createGame }) => createGame(parent, bus, start))
        await game.current
      }
    } catch {
      setFailed(true)
    }
  }, [bus, take])

  useEffect(() => {
    // Every setState inside load() runs after an await.
    // eslint-disable-next-line react/set-state-in-effect
    void load()
    return () => {
      void game.current?.then((g) => g.destroy(true))
      game.current = null
    }
  }, [load])

  // The scene draws whatever the server last said.
  useEffect(() => {
    if (state) bus.emit('state', state)
  }, [bus, state])
  useEffect(() => {
    bus.emit('questGiver', { giver: quests?.main?.giver ?? null, done: quests?.main?.done ?? false })
  }, [bus, quests])
  useEffect(() => {
    bus.setPaused(panel !== null)
  }, [bus, panel])

  // What the scene says back.
  const questsRef = useRef(quests)
  useEffect(() => {
    questsRef.current = quests
  }, [quests])
  useEffect(() => {
    const offs = [
      bus.on('focus', setFocus),
      bus.on('ready', () => setReady(true)),
      bus.on('moved', ({ x, y }) => void gameApi.move(x, y).catch(() => {})),
      bus.on('interact', (target) => {
        switch (target.kind) {
          case 'plot':
            setPanel({ kind: 'plot', idx: target.idx })
            break
          case 'npc':
            setPanel({ kind: 'talk', who: target.id })
            break
          case 'house':
            setPanel({ kind: 'house' })
            break
          case 'mailbox':
            if (questsRef.current?.main?.giver === 'grandma') setPanel({ kind: 'talk', who: 'grandma' })
            else setToast({ text: t('arena.mail.none') })
            break
          case 'board':
            setPanel({ kind: 'quests', tab: 'daily' })
            break
        }
      }),
    ]
    return () => offs.forEach((off) => off())
  }, [bus, t])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(id)
  }, [toast])

  /** Makes one move: the answer replaces the farm, the quests follow. True
   *  when the server took it. */
  const move = useCallback(
    async (fn: () => Promise<GameState>): Promise<boolean> => {
      setBusy(true)
      try {
        take(await fn())
        void refreshQuests()
        return true
      } catch (err) {
        setToast({ text: gameError(err, t) })
        return false
      } finally {
        setBusy(false)
      }
    },
    [refreshQuests, t, take],
  )

  // The word card waits for the player to finish picking the crop.
  const cardTimer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(cardTimer.current), [])

  const plant = async (idx: number, seed: string) => {
    if (await move(() => gameApi.plant(idx, seed))) {
      setPanel(null)
      bus.emit('planted', idx)
    }
  }

  const sleep = async () => {
    const slept = await move(() => gameApi.sleep())
    setPanel(null)
    if (slept) bus.emit('slept', undefined)
  }

  const harvest = async (idx: number) => {
    setBusy(true)
    try {
      const res = await gameApi.harvest(idx)
      take(res.state)
      setPanel(null)
      bus.emit('harvested', idx)
      cardTimer.current = window.setTimeout(() => setPanel({ kind: 'word', word: res.word, gold: res.gold }), 600)
      void refreshQuests()
      if (res.word) void refreshVocab()
    } catch (err) {
      setToast({ text: gameError(err, t) })
    } finally {
      setBusy(false)
    }
  }

  const claim = async (quest: string) => {
    setBusy(true)
    try {
      const res = await gameApi.claim(quest)
      take(res.state)
      setQuests(res.quests)
      setToast({ text: t('arena.got'), reward: res.reward })
      if (quest === 'main') setPanel(null)
    } catch (err) {
      setToast({ text: gameError(err, t) })
    } finally {
      setBusy(false)
    }
  }

  const close = useCallback(() => setPanel(null), [])
  const common = state ? { state, locale, t, onClose: close, busy, skew } : null

  const talk = (who: NpcId | 'grandma') => {
    const main = quests?.main ?? null
    const quest = main && main.giver === who ? main : null
    const lines = quest ? quest.lines : [idleLine(who)]
    const actions =
      who === 'mira' ? (
        <button type="button" className="btn btn-secondary" onClick={() => setPanel({ kind: 'shop' })}>
          {t('arena.shopOpen')}
        </button>
      ) : who === 'bram' ? (
        <button type="button" className="btn btn-secondary" onClick={() => setPanel({ kind: 'bram' })}>
          {t('arena.bramOpen')}
        </button>
      ) : null
    return (
      <Dialogue
        speaker={who}
        lines={lines}
        quest={quest}
        state={state}
        locale={locale}
        t={t}
        busy={busy}
        onClose={close}
        onClaim={() => void claim('main')}
        actions={actions}
      />
    )
  }

  return (
    <div className="arena" data-testid="arena" data-ready={ready}>
      <div ref={holder} className="arena-canvas" />

      {failed && (
        <div className="arena-cover">
          <p>{t('arena.loadFailed')}</p>
          <button type="button" className="btn btn-primary" onClick={() => void load()}>
            {t('arena.retry')}
          </button>
        </div>
      )}
      {!state && !failed && (
        <div className="arena-cover">
          <Loading label={t('arena.loading')} />
        </div>
      )}

      {state && (
        <>
          <Hud
            state={state}
            quests={quests}
            t={t}
            skew={skew}
            onQuests={() => setPanel({ kind: 'quests', tab: 'main' })}
            onBag={() => setPanel({ kind: 'bag' })}
          />
          <Tracker quests={quests} locale={locale} onOpen={() => setPanel({ kind: 'quests', tab: 'main' })} />
          {!panel && <ActionButton focus={focus} bus={bus} t={t} />}
          {!panel && <Joystick bus={bus} />}
          <p className="arena-controls">{t('arena.controls')}</p>
        </>
      )}

      {toast && (
        <div className="arena-toast" role="status">
          <span>{toast.text}</span>
          {toast.reward && <RewardChips reward={toast.reward} state={state} locale={locale} t={t} />}
        </div>
      )}

      {common && panel?.kind === 'plot' && (
        <PlotPanel
          {...common}
          idx={panel.idx}
          onPlant={(seed) => void plant(panel.idx, seed)}
          onHarvest={() => void harvest(panel.idx)}
        />
      )}
      {common && panel?.kind === 'shop' && (
        <ShopPanel {...common} onBuy={(item) => void move(() => gameApi.buy(item, 1))} />
      )}
      {common && panel?.kind === 'bram' && (
        <BramPanel
          {...common}
          onUnlock={(idx) => void move(() => gameApi.unlock(idx))}
          onUpgrade={(idx) => void move(() => gameApi.upgrade(idx))}
        />
      )}
      {common && panel?.kind === 'house' && (
        <HousePanel {...common} onSleep={() => void sleep()} />
      )}
      {common && panel?.kind === 'bag' && (
        <BagPanel {...common} onUse={(item) => void move(() => gameApi.use(item))} />
      )}
      {panel?.kind === 'word' && (
        <WordCard
          word={panel.word}
          gold={panel.gold}
          t={t}
          onClose={close}
          onListen={(word) => void gameApi.listen(word).then(refreshQuests, () => {})}
        />
      )}
      {panel?.kind === 'talk' && talk(panel.who)}
      {quests && panel?.kind === 'quests' && (
        <QuestBook
          quests={quests}
          state={state}
          locale={locale}
          t={t}
          busy={busy}
          skew={skew}
          start={panel.tab}
          onClose={close}
          onClaim={(q) => void claim(q)}
        />
      )}
    </div>
  )
}
