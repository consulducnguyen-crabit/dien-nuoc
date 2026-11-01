// Hộp thoại xác nhận (modal) dùng chung cho mọi thao tác xoá/ghi đè dữ liệu.
// Dùng <dialog>.showModal(): khoá nền, bẫy focus, Esc = Huỷ. Focus mặc định ở nút Huỷ để bấm nhầm Enter không xoá.
import { h } from './dom.js';

let current = null;

/**
 * @param {{title:string, message?:string, details?:string[], confirmText?:string, cancelText?:string, danger?:boolean}} o
 * @returns {Promise<boolean>} true chỉ khi người dùng bấm nút xác nhận
 */
export function confirmDialog({ title, message = '', details = [], confirmText = 'Xoá', cancelText = 'Huỷ', danger = true }) {
  if (current) return Promise.resolve(false); // đang có hộp thoại khác: không chồng thêm
  return new Promise((resolve) => {
    let result = false;
    const cancelBtn = h('button', { type: 'button', class: 'btn btn-secondary' }, cancelText);
    const okBtn = h('button', { type: 'button', class: danger ? 'btn btn-danger' : 'btn' }, confirmText);
    const dlg = h('dialog', { class: 'modal', 'aria-labelledby': 'modal-title' },
      h('h2', { id: 'modal-title' }, title),
      message ? h('p', { class: 'text-sub mt' }, message) : null,
      details.length ? h('ul', { class: 'modal-list' }, ...details.map((d) => h('li', null, d))) : null,
      h('div', { class: 'actions mt' }, cancelBtn, okBtn));
    const finish = (value) => { result = value; dlg.close(); };
    cancelBtn.addEventListener('click', () => finish(false));
    okBtn.addEventListener('click', () => finish(true));
    dlg.addEventListener('click', (e) => { if (e.target === dlg) finish(false); }); // bấm ra ngoài = Huỷ
    dlg.addEventListener('close', () => { dlg.remove(); current = null; resolve(result); }); // Esc cũng đi qua đây với result=false
    current = dlg;
    document.body.append(dlg);
    dlg.showModal();
    cancelBtn.focus();
  });
}
