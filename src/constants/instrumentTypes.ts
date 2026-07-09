export const instrumentTypeOptions = [
  'Guitar',
  'Bass',
  'Piano',
  'Drums',
  'Vocals',
  'Trumpet',
  'Violin',
  'Ukulele',
  'Saxophone',
  'Flute',
  'Synth',
  'Other',
];

export const instrumentTechniquesMap: Record<string, string[]> = {
  'Guitar': ['Pick', 'Fingerstyle', 'Strumming', 'Tapping', 'Slap', 'Harmonics', 'Solo', 'Palm Mute', 'Other'],
  'Bass': ['Pick', 'Fingerstyle', 'Slap', 'Tapping', 'Palm Mute', 'Harmonics', 'Solo', 'Other'],
  'Piano': ['Solo', 'Harmonics', 'Other'],
  'Drums': ['Rim Shot', 'Double Pedal', 'Single Pedal', 'Blast Beat', 'Ghost Notes', 'Rolls', 'Solo', 'Other'],
  'Vocals': ['Whistle', 'Scream', 'Growl', 'Yodel', 'Solo', 'Other'],
  'Trumpet': ['Vibrato', 'Staccato', 'Legato', 'Muted', 'Growl', 'Solo', 'Other'],
  'Violin': ['Vibrato', 'Staccato', 'Legato', 'Pizzicato', 'Solo', 'Other'],
  'Ukulele': ['Strumming', 'Fingerstyle', 'Tapping', 'Solo', 'Other'],
  'Saxophone': ['Vibrato', 'Staccato', 'Legato', 'Growl', 'Altissimo', 'Solo', 'Other'],
  'Flute': ['Vibrato', 'Staccato', 'Legato', 'Harmonics', 'Solo', 'Other'],
  'Synth': ['Arpeggio', 'Legato', 'Staccato', 'Solo', 'Other'],
  'Other': ['Solo', 'Other'],
};

export interface TuningOption {
  value: string;
  label: string;
}

export const instrumentTuningsMap: Record<string, TuningOption[]> = {
  'Guitar': [
    { value: 'EADGBE', label: 'EADGBE (Standard)' },
    { value: 'DADGBE', label: 'DADGBE (Drop D)' },
    { value: 'EbAbDbGbBbEb', label: 'EbAbDbGbBbEb (Half-step down)' },
    { value: 'DADGAD', label: 'DADGAD' },
    { value: 'DGDGBD', label: 'DGDGBD (Open G)' },
    { value: 'Other', label: 'Other' },
  ],
  'Bass': [
    { value: 'EADG', label: 'EADG (Standard 4-string)' },
    { value: 'BEADG', label: 'BEADG (Standard 5-string)' },
    { value: 'BEADGC', label: 'BEADGC (Standard 6-string)' },
    { value: 'DADG', label: 'DADG (Drop D 4-string)' },
    { value: 'EbAbDbGb', label: 'EbAbDbGb (Half-step down 4-string)' },
    { value: 'BbEbAbDbGb', label: 'BbEbAbDbGb (Half-step down 5-string)' },
    { value: 'Other', label: 'Other' },
  ],
  'Ukulele': [
    { value: 'GCEA', label: 'GCEA (Standard)' },
    { value: 'DGBE', label: 'DGBE (Low G)' },
    { value: 'Other', label: 'Other' },
  ],
  'Violin': [
    { value: 'GDAE', label: 'GDAE (Standard)' },
    { value: 'Other', label: 'Other' },
  ],
  'Other': [
    { value: 'Other', label: 'Other' },
  ],
};
