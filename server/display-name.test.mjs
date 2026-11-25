import {test} from 'node:test';
import assert from 'node:assert/strict';
import {displayName} from '../shared/display-name.mjs';
test('display names preserve only first and last words, including accents and mononyms',()=>{for(const [name,expected] of [['  João Pedro da Silva  ','João Silva'],['Ana Maria','Ana Maria'],['Li','Li'],['',''],['  ',''],['Érica\tde Souza','Érica Souza'],[null,'']])assert.equal(displayName(name),expected)});
