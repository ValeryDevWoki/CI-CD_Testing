// mockData.js (CommonJS version)

// 1) Define 20 employees with roles, maximum hours (8 or 9), and exactly 5 workdays per week.
const allEmployees = [
    { id: 1, name: 'Alice', role: 'manager', maxHours: 8, maxDays: 5 },
    { id: 2, name: 'Bob', role: 'manager', maxHours: 9, maxDays: 5 },
    { id: 3, name: 'Charlie', role: 'employee', maxHours: 8, maxDays: 5 },
    { id: 4, name: 'David', role: 'employee', maxHours: 9, maxDays: 5 },
    { id: 5, name: 'Eva', role: 'employee', maxHours: 8, maxDays: 5 },
    { id: 6, name: 'Frank', role: 'employee', maxHours: 9, maxDays: 5 },
    { id: 7, name: 'Grace', role: 'employee', maxHours: 8, maxDays: 5 },
    { id: 8, name: 'Hannah', role: 'employee', maxHours: 9, maxDays: 5 },
    { id: 9, name: 'Ian', role: 'employee', maxHours: 8, maxDays: 5 },
    { id: 10, name: 'Jane', role: 'employee', maxHours: 9, maxDays: 5 },
    { id: 11, name: 'Kevin', role: 'employee', maxHours: 8, maxDays: 5 },
    { id: 12, name: 'Laura', role: 'employee', maxHours: 9, maxDays: 5 },
    { id: 13, name: 'Mike', role: 'employee', maxHours: 8, maxDays: 5 },
    { id: 14, name: 'Nina', role: 'employee', maxHours: 9, maxDays: 5 },
    { id: 15, name: 'Oscar', role: 'employee', maxHours: 8, maxDays: 5 },
    { id: 16, name: 'Paula', role: 'employee', maxHours: 9, maxDays: 5 },
    { id: 17, name: 'Quinn', role: 'employee', maxHours: 8, maxDays: 5 },
    { id: 18, name: 'Rachel', role: 'employee', maxHours: 9, maxDays: 5 },
    { id: 19, name: 'Steve', role: 'employee', maxHours: 8, maxDays: 5 },
    { id: 20, name: 'Tina', role: 'employee', maxHours: 9, maxDays: 5 }
];

// 2) Users array for user management (groups is an array of strings).
const users = [
    {
        id: 1,
        fullName: 'Alice Brown',
        email: 'alice.brown@example.com',
        phone: '555-1001',
        role: 'manager',
        groups: ['Operations'],
        status: 'Active'
    },
    {
        id: 2,
        fullName: 'Bob Smith',
        email: 'bob.smith@example.com',
        phone: '555-1002',
        role: 'manager',
        groups: ['Sales'],
        status: 'Active'
    },
    {
        id: 3,
        fullName: 'Charlie Adams',
        email: 'charlie.adams@example.com',
        phone: '555-1003',
        role: 'employee',
        groups: ['Support'],
        status: 'Active'
    },
    {
        id: 4,
        fullName: 'David Johnson',
        email: 'david.johnson@example.com',
        phone: '555-1004',
        role: 'employee',
        groups: ['Development'],
        status: 'Active'
    },
    {
        id: 5,
        fullName: 'Eva Martinez',
        email: 'eva.martinez@example.com',
        phone: '555-1005',
        role: 'employee',
        groups: ['Development', 'Support'],
        status: 'Active'
    },
    {
        id: 6,
        fullName: 'Frank Miller',
        email: 'frank.miller@example.com',
        phone: '555-1006',
        role: 'employee',
        groups: ['Support'],
        status: 'Not Active'
    },
    {
        id: 7,
        fullName: 'Grace Wilson',
        email: 'grace.wilson@example.com',
        phone: '555-1007',
        role: 'employee',
        groups: ['HR'],
        status: 'Active'
    },
    {
        id: 8,
        fullName: 'Hannah Davis',
        email: 'hannah.davis@example.com',
        phone: '555-1008',
        role: 'employee',
        groups: ['Sales'],
        status: 'Active'
    },
    {
        id: 9,
        fullName: 'Ian Wright',
        email: 'ian.wright@example.com',
        phone: '555-1009',
        role: 'employee',
        groups: ['Support'],
        status: 'Terminated'
    },
    {
        id: 10,
        fullName: 'Jane Thompson',
        email: 'jane.thompson@example.com',
        phone: '555-1010',
        role: 'employee',
        groups: ['Operations'],
        status: 'Active'
    },
    {
        id: 11,
        fullName: 'Kevin Lee',
        email: 'kevin.lee@example.com',
        phone: '555-1011',
        role: 'employee',
        groups: ['Sales'],
        status: 'Active'
    },
    {
        id: 12,
        fullName: 'Laura Baker',
        email: 'laura.baker@example.com',
        phone: '555-1012',
        role: 'employee',
        groups: ['HR'],
        status: 'Active'
    },
    {
        id: 13,
        fullName: 'Mike Hill',
        email: 'mike.hill@example.com',
        phone: '555-1013',
        role: 'employee',
        groups: ['Development'],
        status: 'Active'
    },
    {
        id: 14,
        fullName: 'Nina Green',
        email: 'nina.green@example.com',
        phone: '555-1014',
        role: 'employee',
        groups: ['Development'],
        status: 'Active'
    },
    {
        id: 15,
        fullName: 'Oscar Young',
        email: 'oscar.young@example.com',
        phone: '555-1015',
        role: 'employee',
        groups: ['Operations'],
        status: 'Not Active'
    },
    {
        id: 16,
        fullName: 'Paula Foster',
        email: 'paula.foster@example.com',
        phone: '555-1016',
        role: 'employee',
        groups: ['Support'],
        status: 'Terminated'
    },
    {
        id: 17,
        fullName: 'Quinn Ross',
        email: 'quinn.ross@example.com',
        phone: '555-1017',
        role: 'employee',
        groups: ['Sales'],
        status: 'Active'
    },
    {
        id: 18,
        fullName: 'Rachel King',
        email: 'rachel.king@example.com',
        phone: '555-1018',
        role: 'employee',
        groups: ['Development'],
        status: 'Active'
    },
    {
        id: 19,
        fullName: 'Steve Carter',
        email: 'steve.carter@example.com',
        phone: '555-1019',
        role: 'employee',
        groups: ['Support'],
        status: 'Active'
    },
    {
        id: 20,
        fullName: 'Tina Brooks',
        email: 'tina.brooks@example.com',
        phone: '555-1020',
        role: 'employee',
        groups: ['HR'],
        status: 'Active'
    }
];

// 3) groupOptions array (for multi-select or group qualifications).
const groupOptions = [
    'Operations',
    'Sales',
    'Support',
    'Development',
    'HR',
    'Accounting',
    'Marketing'
];

// 4) days array (sometimes used in scheduling logic).
const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// 5) getFixedDateForDay function if you need it for references.
function getFixedDateForDay(day) {
    const mapping = {
        Sunday:    '2025-01-05',
        Monday:    '2025-01-06',
        Tuesday:   '2025-01-07',
        Wednesday: '2025-01-08',
        Thursday:  '2025-01-09',
        Friday:    '2025-01-10',
        Saturday:  '2025-01-11'
    };
    return mapping[day];
}

// 6) Full single-week schedule (24-hour coverage) for legacy usage
let assignments = [];
allEmployees.forEach(emp => {
    for (let i = 0; i < emp.maxDays; i++) {
        assignments.push(emp.id);
    }
});
// Shuffle using Fisher-Yates
for (let i = assignments.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [assignments[i], assignments[j]] = [assignments[j], assignments[i]];
}

// shift distribution
const shiftsPerDay = {
    Sunday: 14,
    Monday: 15,
    Tuesday: 15,
    Wednesday: 14,
    Thursday: 14,
    Friday: 14,
    Saturday: 14
};

const fullWeekSchedule = (() => {
    const schedule = {};
    let index = 0;

    days.forEach(day => {
        const numShifts = shiftsPerDay[day];
        schedule[day] = [];
        const spacing = (24 - 8) / (numShifts - 1);
        for (let i = 0; i < numShifts; i++) {
            const empId = assignments[index++];
            const emp = allEmployees.find(e => e.id === empId);
            const startHour = Math.floor(i * spacing);
            const endHour = (startHour + emp.maxHours) % 24;

            const formatTime = h => (h < 10 ? '0' + h : h) + ':00';
            const start = formatTime(startHour);
            const end = formatTime(endHour);

            schedule[day].push({
                id: `${day}-${i}-${empId}`,
                employeeId: emp.id,
                employee: emp.name,
                role: emp.role,
                date: getFixedDateForDay(day),
                start,
                end,
                duration: emp.maxHours
            });
        }
    });
    return schedule;
})();

// 7) Some optional dummySchedules / dummyNotes
const dummySchedules = {
    "2025-W01": [
        { id: 1, employee: 'Alice',   date: '2025-01-06', start: '09:00', end: '17:00', duration: 8 },
        { id: 2, employee: 'Bob',     date: '2025-01-07', start: '10:00', end: '19:00', duration: 9 }
    ],
    "2025-W02": [
        { id: 1, employee: 'Alice',   date: '2025-01-13', start: '09:00', end: '17:00', duration: 8 },
        { id: 2, employee: 'Bob',     date: '2025-01-14', start: '10:00', end: '19:00', duration: 9 },
        { id: 3, employee: 'Charlie', date: '2025-01-15', start: '08:00', end: '16:00', duration: 8 }
    ]
};

const dummyNotes = [
    { id: 1, employee: 'Alice',   date: '2025-01-06', note: 'Half day request due to appointment', status: 'not handled', decision: 'pending' },
    { id: 2, employee: 'Bob',     date: '2025-01-07', note: 'Full day off request', status: 'not handled', decision: 'pending' },
    { id: 3, employee: 'Charlie', date: '2025-01-08', note: 'Needs shift change', status: 'handled', decision: 'accepted' }
];

// 8) Export everything with CommonJS
module.exports = {
    allEmployees,
    users,
    groupOptions,
    days,
    getFixedDateForDay,
    fullWeekSchedule,
    dummySchedules,
    dummyNotes
};
