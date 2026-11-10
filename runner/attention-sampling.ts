import {createHash} from 'node:crypto';
import type {BetaConfig} from '../jev/virtual-beta/contracts.js';

export type AttentionSampling={scheme:'domain-separated-v1';rootSeed:number;gateSeed:number;gazeSeed:number};

/** Separate the attention gate and conditional gaze from ordinary action draws.
 * The untagged path retains the original seed and persisted record shape. */
export function deriveAttentionSampling(config:BetaConfig):AttentionSampling|undefined{
 if(config.attention?.sampling!=='domain-separated-v1')return undefined;
 const rootSeed=config.selection.seed;
 const seed=(stage:'gate'|'gaze')=>createHash('sha256').update(`jev-virtual-beta-attention-stream:v2:${stage}:${rootSeed}`,'utf8').digest().readUInt32BE(0);
 return {scheme:'domain-separated-v1',rootSeed,gateSeed:seed('gate'),gazeSeed:seed('gaze')};
}
