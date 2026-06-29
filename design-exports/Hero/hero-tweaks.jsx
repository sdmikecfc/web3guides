// Launch Wars S2 hero — Tweaks wiring (headline copy + layout variant)
// URL params override tweaks so the variations canvas can pin each frame:
//   ?v=helm|monument|chart   ?h=conquer|horizon|ship

const LW_COPY = {
  conquer: {
    headline: 'Conquer the seas',
    subline: 'Five fleets at war over one ocean of treasure. Pick your flag, fight with your crew, and win a share of real prizes.'
  },
  horizon: {
    headline: 'A new sail on the horizon',
    subline: 'A new fleet joins the war every day in week one. Join early, fly your flag, and help your crew take the sea.'
  },
  ship: {
    headline: 'Your ship is waiting',
    subline: 'Join a fleet, play simple daily games, and grow your ship from dinghy to flagship. Every fleet wins a share.'
  }
};

const LW_HEADLINE_LABELS = { 'Conquer': 'conquer', 'New sail': 'horizon', 'Your ship': 'ship' };
const LW_LAYOUT_LABELS = { 'Helm': 'helm', 'Monument': 'monument', 'Chart room': 'chart' };

const LW_TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "headline": "conquer",
  "layout": "helm"
}/*EDITMODE-END*/;

function LwTweaksApp() {
  const [t, setTweak] = useTweaks(LW_TWEAK_DEFAULTS);

  const params = new URLSearchParams(window.location.search);
  const forcedV = params.get('v');
  const forcedH = params.get('h');

  const layout = (forcedV && LW_COPY && ['helm', 'monument', 'chart'].includes(forcedV)) ? forcedV : t.layout;
  const copyKey = (forcedH && LW_COPY[forcedH]) ? forcedH : (LW_COPY[t.headline] ? t.headline : 'conquer');

  React.useEffect(() => {
    document.body.setAttribute('data-variant', layout);
    const h = document.getElementById('headline');
    const s = document.getElementById('subline');
    if (h) h.textContent = LW_COPY[copyKey].headline;
    if (s) s.textContent = LW_COPY[copyKey].subline;
  }, [layout, copyKey]);

  const headlineLabel = Object.keys(LW_HEADLINE_LABELS).find((k) => LW_HEADLINE_LABELS[k] === copyKey);
  const layoutLabel = Object.keys(LW_LAYOUT_LABELS).find((k) => LW_LAYOUT_LABELS[k] === layout);

  return (
    <TweaksPanel>
      <TweakSection label="Copy" />
      <TweakRadio
        label="Headline"
        value={headlineLabel}
        options={Object.keys(LW_HEADLINE_LABELS)}
        onChange={(v) => setTweak('headline', LW_HEADLINE_LABELS[v])}
      />
      <TweakSection label="Layout" />
      <TweakRadio
        label="Composition"
        value={layoutLabel}
        options={Object.keys(LW_LAYOUT_LABELS)}
        onChange={(v) => setTweak('layout', LW_LAYOUT_LABELS[v])}
      />
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById('tweaks-root')).render(<LwTweaksApp></LwTweaksApp>);
