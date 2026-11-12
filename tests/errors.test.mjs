import {test} from 'node:test';
import assert from 'node:assert/strict';
import {errorMessage} from '../src/errors.ts';
test('wallet and contract errors explain cause chains without hiding custom errors',()=>{
  assert.match(errorMessage({cause:{cause:{data:{errorName:'DuplicateEvidence'}}}}),/Ảnh này/);
  assert.match(errorMessage({cause:{data:{errorName:'SelfApproval'}}}),/không thể tự duyệt/);
  assert.match(errorMessage({cause:{data:{errorName:'AccessControlUnauthorizedAccount'}}}),/chưa có quyền/);
  assert.match(errorMessage({cause:{data:{errorName:'ERC20InsufficientBalance'}}}),/chưa đủ ECO/);
  assert.match(errorMessage({cause:{data:{errorName:'EnforcedPause'}}}),/tạm dừng/);
  assert.match(errorMessage({cause:{cause:{code:4001}}}),/đã hủy/);
  assert.match(errorMessage({message:'insufficient funds for gas'}),/AVAX trên Fuji/);
  const cyclic={message:'Lỗi cụ thể'};cyclic.cause=cyclic;
  assert.equal(errorMessage(cyclic),'Lỗi cụ thể');
});
