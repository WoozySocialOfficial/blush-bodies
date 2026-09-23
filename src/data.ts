export type ClassSlot = {
  id: string;
  time: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  programme: string;
  status: 'Ready' | 'Draft' | 'Unplanned' | 'Complete';
  group: string;
};

export type Movement = {
  id: string;
  title: string;
  position: string;
  side: string;
  duration: string;
  phase: 'Warm-up' | 'Main' | 'Cool-down';
  cue: string;
};

export const classSlots: ClassSlot[] = [
  { id: 'class-1', time: '07:00', level: 'Beginner', programme: 'Week 2 / Day 4', status: 'Complete', group: 'Morning group' },
  { id: 'class-2', time: '09:30', level: 'Intermediate', programme: 'Week 3 / Day 2', status: 'Ready', group: 'Studio A' },
  { id: 'class-3', time: '12:15', level: 'Beginner', programme: 'Week 1 / Day 3', status: 'Draft', group: 'Lunch group' },
  { id: 'class-4', time: '16:30', level: 'Advanced', programme: 'Week 4 / Day 1', status: 'Unplanned', group: 'Studio A' },
  { id: 'class-5', time: '18:00', level: 'Intermediate', programme: 'Week 2 / Day 5', status: 'Ready', group: 'Evening group' },
];

export const movements: Movement[] = [
  { id: 'm1', title: 'Standing breath and reach', position: 'Standing', side: 'Both sides', duration: '01:30', phase: 'Warm-up', cue: 'Grow tall through the crown of the head.' },
  { id: 'm2', title: 'Pelvic curl', position: 'Lying on back', side: 'Both sides', duration: '02:30', phase: 'Warm-up', cue: 'Peel the spine away from the mat with control.' },
  { id: 'm3', title: 'Side-leg lift', position: 'Lying on left', side: 'Right leg', duration: '02:00', phase: 'Main', cue: 'Keep the waist lifted and the pelvis quiet.' },
  { id: 'm4', title: 'Side change', position: 'Transition', side: 'Change sides', duration: '00:20', phase: 'Main', cue: 'Move with control and reset your alignment.' },
  { id: 'm5', title: 'Side-leg lift', position: 'Lying on right', side: 'Left leg', duration: '02:00', phase: 'Main', cue: 'Reach long through the heel before you lift.' },
  { id: 'm6', title: 'Quadruped reach', position: 'Hands and knees', side: 'Alternating', duration: '03:00', phase: 'Main', cue: 'Press the floor away and keep the ribs connected.' },
  { id: 'm7', title: 'Seated spine stretch', position: 'Seated', side: 'Both sides', duration: '02:00', phase: 'Cool-down', cue: 'Lengthen first, then soften forward.' },
];
