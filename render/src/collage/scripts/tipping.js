// Pause marks: "[0.3]" holds 0.3s after that sentence.
// `at` on a piece or label = the sentence number (from 0) it arrives on.
export const tipping = {
  palette: 'tomato',
  number: 1,
  beats: [
    { layout: 'hook', headline: ['Why do', 'we tip?'],
      pieces: [{ name: 'hand', at: 0 }, { name: 'watch', at: 1 }, 'cup'],
      say: 'You tip the waiter. [0.2] You don’t tip the nurse. [0.3] Why? [0.5]' },
    { layout: 'duo', cite: 'Marcel Mauss, The Gift (1925)', citeAt: 0,
      pieces: [{ name: 'gift', at: 1 }, { name: 'handshake', at: 0 }],
      labels: [{ text: 'Never free', at: 1 }],
      say: 'A century ago, Marcel Mauss found one rule in gift-giving, everywhere he looked. [0.45] A gift is never free.' },
    { layout: 'top', pieces: [{ name: 'hand', at: 0 }],
      labels: [{ text: 'Optional', at: 1 }, { text: 'Expected', at: 2 }, { text: 'Insulting to skip', at: 3 }],
      say: 'A tip is money that follows gift rules. [0.35] Optional. [0.15] Expected. [0.15] Insulting to skip.' },
    { layout: 'solo', cite: 'Kerry Segrave, Tipping (1998)', citeAt: 1,
      pieces: [{ name: 'bell', at: 0 }],
      labels: [{ text: 'You tip down', at: 2 }],
      say: 'And it has a direction. [0.35] Tips began as coins for other people’s servants. [0.45] You tip down.' },
    { layout: 'duo', pieces: [{ name: 'chocolates', at: 0 }, { name: 'watch', at: 0 }],
      labels: [{ text: 'A real gift', at: 1 }],
      say: 'So the nurse gets chocolates. [0.35] Cash would turn her care into a purchase.' },
    { layout: 'payoff', headline: ['Tip some.', 'Thank', 'the rest.'],
      pieces: [{ name: 'hand', at: 0 }, { name: 'chocolates', at: 1 }],
      say: 'We tip the people we’re allowed to pay for kindness. [0.4] Everyone else, we thank.' },
  ],
}
