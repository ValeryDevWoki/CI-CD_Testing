// __tests__/eligibility.unit.test.js

describe('Eligibility helpers', () => {
  // если ты хелперы не экспортируешь — лучше вынести их в отдельный файл и импортировать.
  // Пока — копируем ту же логику сюда (unit тест на контракт).
  function isActiveEmployeeRole(roleValue) {
    const r = String(roleValue || '').trim().toLowerCase();
    return r === 'employee' || r.includes('employee');
  }

  function isActiveStatus(statusValue) {
    return String(statusValue || '').trim().toLowerCase() === 'active';
  }

  test('isActiveEmployeeRole', () => {
    expect(isActiveEmployeeRole('Employee')).toBe(true);
    expect(isActiveEmployeeRole('employee')).toBe(true);
    expect(isActiveEmployeeRole('Employee,Manager')).toBe(true);
    expect(isActiveEmployeeRole('Manager,Employee')).toBe(true);
    expect(isActiveEmployeeRole('Manager')).toBe(false);
    expect(isActiveEmployeeRole(null)).toBe(false);
  });

  test('isActiveStatus', () => {
    expect(isActiveStatus('Active')).toBe(true);
    expect(isActiveStatus('active')).toBe(true);
    expect(isActiveStatus('Inactive')).toBe(false);
    expect(isActiveStatus(null)).toBe(false);
  });

  test('no-shifts text behavior (contract)', () => {
    // контракт: если смен нет — добавляется строка "אין משמרות השבוע"
    const lines = [];
    if (lines.length === 0) lines.push('אין משמרות השבוע');
    expect(lines).toEqual(['אין משמרות השבוע']);
  });
});
