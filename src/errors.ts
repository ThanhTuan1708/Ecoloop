const messages: Record<string, string> = {
  DuplicateEvidence: 'Ảnh này đã được sử dụng cho một yêu cầu. Hãy chụp ảnh mới của vật liệu cần gửi.',
  SelfApproval: 'Bạn không thể tự duyệt yêu cầu của mình. Hãy dùng một ví thu gom khác đã được cấp quyền.',
  InvalidInput: 'Vật liệu hoặc khối lượng không hợp lệ. Khối lượng phải từ 0,001 đến 1.000 kg.',
  InvalidStatus: 'Yêu cầu hoặc biên nhận đã được xử lý. Nhấn Làm mới để xem trạng thái hiện tại.',
  EnforcedPause: 'Hệ thống đang tạm dừng. Vui lòng chờ đơn vị tổ chức mở lại.',
  ExpectedPause: 'Hệ thống đã được mở lại. Hãy làm mới dữ liệu.',
  AccessControlUnauthorizedAccount: 'Ví này chưa có quyền thực hiện thao tác. Nhờ quản trị cấp quyền phù hợp cho đúng địa chỉ ví.',
  ERC20InsufficientBalance: 'Bạn chưa đủ ECO để đổi phần thưởng này. Hãy chọn quà ít điểm hơn hoặc tiếp tục tái chế.',
  UnavailableReward: 'Phần thưởng đã hết hoặc tạm ngừng đổi. Hãy chọn món quà khác.',
};
export function errorMessage(error: unknown): string {
  const seen = new Set<unknown>();
  let current: any = error;
  const nodes: any[] = [];
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current); nodes.push(current); current = current.cause;
  }
  for (const e of nodes) {
    if (e.code === 4001 || /UserRejected/i.test(e.name || '')) return 'Bạn đã hủy yêu cầu trong ví. Có thể thử lại khi sẵn sàng.';
    if (e.code === -32002) return 'Có yêu cầu đang chờ trong Core. Mở tiện ích ví để xử lý.';
    const name = e.data?.errorName || e.errorName;
    if (messages[name]) return messages[name];
  }
  const description = nodes.map(e => [e.name, e.shortMessage, e.message, e.details].filter(Boolean).join(' ')).join(' ');
  for (const [name, message] of Object.entries(messages)) if (description.includes(name)) return message;
  if (/insufficient funds|exceeds the balance/i.test(description)) return 'Ví chưa đủ AVAX trên Fuji để trả phí. Nạp AVAX testnet vào đúng địa chỉ ví đang kết nối.';
  if (/Timeout|timed out/i.test(description)) return 'Kết nối quá thời gian chờ. Nếu đã ký giao dịch, kiểm tra mục giao dịch đang chờ trước khi gửi lại.';
  if (/fetch failed|Failed to fetch|HTTP request failed|NetworkError/i.test(description)) return 'Không kết nối được server hoặc mạng Avalanche. Kiểm tra kết nối rồi thử lại.';
  if (/reverted|execution revert/i.test(description)) return 'Contract đã từ chối thao tác. Làm mới dữ liệu, kiểm tra trạng thái yêu cầu và quyền của ví rồi thử lại.';
  return nodes[0]?.shortMessage || nodes[0]?.message || 'Có lỗi xảy ra. Vui lòng thử lại.';
}
