export interface DishPresentation {
  src: string;
  svgSrc: string;
  width: number;
  height: number;
  viewBox: string;
  masteryDetail: string;
}

// Frame both presentations together so a mastery reveal never changes scale.
// Native PNG canvas/registration stays identical for plates in the restaurant.
// dk-dish-art-check.mts checks every nonzero-alpha pixel against these boxes.
const PRESENTATIONS: Record<string, { box: string; masteryDetail: string }> = {
  tomato_pasta: { box: "18 77 220 125", masteryDetail: "A tomato ribbon nest with bright basil and shaved cheese" },
  garden_salad: { box: "18 75 220 127", masteryDetail: "Crisp garden leaves, cheese petals and a lemon finish" },
  fries: { box: "18 65 220 137", masteryDetail: "Golden fries, shaved cheese and fresh herb salt" },
  lemonade: { box: "56 28 150 176", masteryDetail: "Fresh mint, a citrus wheel and a gold-rimmed glass" },
  margherita: { box: "18 84 220 118", masteryDetail: "Fresh cheese crown, basil and a hand-painted plate" },
  caciopepe: { box: "18 77 220 125", masteryDetail: "A taller ribbon nest, shaved cheese and truffle" },
  tiramisu: { box: "18 61 220 141", masteryDetail: "Piped cream clouds, a chocolate curl and cocoa flourish" },
  software_noodles: { box: "18 53 220 149", masteryDetail: "A leafy noodle crown, citrus and a gold-rimmed jade bowl" },
  software_tart: { box: "18 64 220 138", masteryDetail: "Lemon ribbons, piped cream and a saffron finish" },
  boner_broth: { box: "18 32 220 170", masteryDetail: "A cream swirl, truffle and toast beside the copper pot" },
  boner_feast: { box: "20 82 218 118", masteryDetail: "A fuller flatbread board with truffle and roasted tomatoes" },
};

/** Use the same native PNG in a cropped SVG viewport for large cookbook art. */
export function dishPresentation(id: string, mastered = false): DishPresentation {
  const safeId = Object.prototype.hasOwnProperty.call(PRESENTATIONS, id) ? id : "margherita";
  const presentation = PRESENTATIONS[safeId];
  return {
    src: `/chef-art/dishes/${safeId}${mastered ? "-mastered" : ""}.png`,
    svgSrc: `/chef-art/dishes/${safeId}${mastered ? "-mastered" : ""}.svg`,
    width: 256,
    height: 224,
    viewBox: presentation.box,
    masteryDetail: presentation.masteryDetail,
  };
}
