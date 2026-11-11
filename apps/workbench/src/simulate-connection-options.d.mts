import type {ConnectionCandidate,ConnectionMechanismOption} from './simulate-types';
export interface ConnectionPoseChoice {candidate:ConnectionCandidate;alternatives:ConnectionCandidate[]}
export interface ConnectionChoiceGroup {key:string;options:ConnectionPoseChoice[]}
export function isFastenerMechanism(kind:string):boolean;
export function connectionBindingKey(candidate:ConnectionCandidate):string;
export function sameConnectionPose(a:ConnectionCandidate,b:ConnectionCandidate):boolean;
export function groupConnectionChoices(candidates:ConnectionCandidate[]):ConnectionChoiceGroup[];
export function connectionPoseCount(candidates:ConnectionCandidate[]):number;
export function connectionChoiceTitle(candidates:ConnectionCandidate[]):string;
export function connectionMechanismUnconfirmed(candidates:ConnectionCandidate[]):boolean;
export function connectionMechanisms(candidates:ConnectionCandidate[]):ConnectionMechanismOption[];
