import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSignupValue} from '../lib/funny/signup.ts';
test('signup values normalize case and reject wildcard, URL and malformed input',()=>{
 assert.equal(normalizeSignupValue('domain',' Columbia.EDU '),'columbia.edu');
 assert.equal(normalizeSignupValue('email',' Guest+lab@Example.COM '),'guest+lab@example.com');
 for(const value of ['*.columbia.edu','@columbia.edu','https://columbia.edu','columbia','a..edu','-a.edu','a-.edu','a'.repeat(64)+'.edu'])assert.throws(()=>normalizeSignupValue('domain',value));
 for(const value of ['a@@example.com','.a@example.com','a.@example.com','a..b@example.com','a b@example.com','x@*.example.com','a'.repeat(65)+'@example.com'])assert.throws(()=>normalizeSignupValue('email',value));
});
