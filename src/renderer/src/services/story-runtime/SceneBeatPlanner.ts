import type {
  CandidateEvent,
  CandidatePrecheck,
  ChapterContract,
  ProvisionalStateOverlay,
  SceneBeat,
  ScenePlan,
  StoryState,
} from '@/types/story-runtime';

import { applyProvisionalOverlay } from './stateOverlay';

export interface SceneBeatPlannerInput {
  chapter: ChapterContract;
  state: StoryState;
  overlay?: ProvisionalStateOverlay;
  candidatesByBeat?: Record<string, CandidateEvent[]>;
}

function makeCandidate(beatId: string, summary: string): CandidateEvent {
  return {
    id: `${beatId}:event:1`,
    summary,
    participants: [],
    prerequisites: [],
    effects: [summary],
  };
}

function checkPrerequisite(prerequisite: string, state: StoryState, beatIds: Set<string>): boolean {
  const [kind, ...parts] = prerequisite.split(':');
  if (kind === 'entity') return Boolean(state.entities[parts.join(':')]);
  if (kind === 'event') return state.events.some(event => event.id === parts.join(':'));
  if (kind === 'beat') return beatIds.has(parts.join(':'));
  if (kind === 'knowledge') {
    const [entityId, ...factParts] = parts;
    return (state.knowledge[entityId] ?? []).includes(factParts.join(':'));
  }
  if (kind === 'item') {
    const [ownerId, itemId, amountText = '1'] = parts;
    return (state.inventory[ownerId]?.[itemId] ?? 0) >= Number(amountText);
  }
  if (kind === 'ability') {
    const [entityId, ability] = parts;
    const abilities = state.entities[entityId]?.attributes.abilities;
    return Array.isArray(abilities) && abilities.includes(ability);
  }
  if (kind === 'location') {
    const entity = state.entities[parts.join(':')];
    return entity?.kind === 'location';
  }
  return false;
}

export class SceneBeatPlanner {
  plan(input: SceneBeatPlannerInput): ScenePlan {
    const chapter = input.chapter;
    const state = applyProvisionalOverlay(input.state, input.overlay);
    const middleNodes = chapter.CPNs.length > 0 ? chapter.CPNs.slice(0, 6) : [chapter.goal];
    const definitions: Array<{ kind: SceneBeat['kind']; summary: string }> = [
      { kind: 'CBN', summary: chapter.CBN },
      ...middleNodes.map(summary => ({ kind: 'CPN' as const, summary })),
      { kind: 'CEN', summary: chapter.CEN },
    ];
    const beats: SceneBeat[] = definitions.map((definition, order) => {
      const id =
        definition.kind === 'CPN'
          ? `chapter-${chapter.chapterNumber}:CPN-${order}`
          : `chapter-${chapter.chapterNumber}:${definition.kind}`;
      const previous = order > 0 ? definitions[order - 1] : undefined;
      const previousId =
        previous?.kind === 'CPN'
          ? `chapter-${chapter.chapterNumber}:CPN-${order - 1}`
          : previous
            ? `chapter-${chapter.chapterNumber}:${previous.kind}`
            : undefined;
      return {
        id,
        kind: definition.kind,
        order,
        summary: definition.summary,
        dependsOn: previousId ? [previousId] : [],
        candidateEvents:
          input.candidatesByBeat?.[id] ?? [makeCandidate(id, definition.summary)],
      };
    });

    const beatIds = new Set(beats.map(beat => beat.id));
    const prechecks: CandidatePrecheck[] = beats.flatMap(beat =>
      beat.candidateEvents.map(candidate => {
        const missing = candidate.prerequisites.filter(
          prerequisite => !checkPrerequisite(prerequisite, state, beatIds)
        );
        const unknownParticipants = candidate.participants.filter(
          participant => !state.entities[participant]
        );
        const unavailableParticipants = candidate.participants.filter(participant => {
          const entity = state.entities[participant];
          return entity?.attributes.alive === false || entity?.attributes.available === false;
        });
        const invalidLocation =
          candidate.locationId &&
          state.entities[candidate.locationId]?.kind !== 'location'
            ? [`地点不可用：${candidate.locationId}`]
            : [];
        const reasons = [
          ...missing.map(value => `缺少前置条件：${value}`),
          ...unknownParticipants.map(value => `未知参与实体：${value}`),
          ...unavailableParticipants.map(value => `参与实体当前不可用：${value}`),
          ...invalidLocation,
        ];
        return { candidateId: candidate.id, accepted: reasons.length === 0, reasons };
      })
    );

    return { chapterNumber: chapter.chapterNumber, beats, prechecks };
  }
}
