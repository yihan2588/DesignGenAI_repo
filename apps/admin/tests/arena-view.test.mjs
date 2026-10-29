import {test} from 'node:test';
import assert from 'node:assert/strict';
import {arenaView} from '../lib/arena-view.ts';
const prompts=[{id:'old-a',archived:true},{id:'old-b',archived:true},{id:'new-a',archived:false},{id:'new-b',archived:false}];
const matchups=[{first_id:'old-a',second_id:'old-b',n:19,first_wins:10,voters:3},{first_id:'new-b',second_id:'new-a',n:2,first_wins:1,voters:2}];
test('default arena contains only the active pair, including reversed slot assignments',()=>{const v=arenaView(prompts,{first_id:'new-a',second_id:'new-b'},matchups,false);assert.deepEqual(v.ids,['new-a','new-b']);assert.deepEqual(v.matchups,[matchups[1]]);});
test('history includes retired configurations with votes but omits unused retired drafts',()=>{const v=arenaView([...prompts,{id:'unused',archived:true}],{first_id:'new-a',second_id:'new-b'},matchups,true);assert.deepEqual(v.ids,['old-a','old-b','new-a','new-b']);assert.equal(v.matchups.length,2);});
test('an experiment without votes never inherits historical scores',()=>{assert.equal(arenaView(prompts,{first_id:'new-a',second_id:'new-b'},[matchups[0]],false).matchups.length,0);});
