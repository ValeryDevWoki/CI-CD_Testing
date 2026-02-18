// src/pages/EmployeeArrivalList.js
import React, { useEffect, useState } from 'react';
import NavBar from '../components/NavBar';
import {
    fetchEmployees,
    fetchDailyArrival,
    createDailyArrival,
    updateDailyArrival,
    deleteDailyArrival
} from '../services/api';
import './EmployeeArrivalList.css';

export default function EmployeeArrivalList() {
    const [dateRangeStart, setDateRangeStart] = useState('2025-01-01');
    const [dateRangeEnd, setDateRangeEnd] = useState('2025-01-07');

    const [employees, setEmployees] = useState([]);
    const [arrivals, setArrivals] = useState([]); // each => { id, employee_id, employee_name, date, status }
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [newArrivalDate, setNewArrivalDate] = useState('');
    const [newArrivalStatus, setNewArrivalStatus] = useState('');

    // load employees
    useEffect(() => {
        async function loadEmp() {
            try {
                const data = await fetchEmployees();
                setEmployees(data);
            } catch (err) {
                alert(err.message || "Failed to load employees");
            }
        }
        loadEmp();
    }, []);

    // load arrivals whenever date range changes
    useEffect(() => {
        async function loadArrivals() {
            try {
                if (dateRangeStart && dateRangeEnd) {
                    const data = await fetchDailyArrival(dateRangeStart, dateRangeEnd);
                    setArrivals(data);
                }
            } catch (err) {
                alert(err.message || "Failed to load daily arrival data");
            }
        }
        loadArrivals();
    }, [dateRangeStart, dateRangeEnd]);

    // create new daily arrival
    const handleCreateArrival = async () => {
        if (!selectedEmployeeId || !newArrivalDate || !newArrivalStatus) {
            alert("Select employee, date, and status.");
            return;
        }
        try {
            await createDailyArrival({
                employee_id: parseInt(selectedEmployeeId, 10),
                date: newArrivalDate,
                status: newArrivalStatus
            });
            alert("Daily arrival created!");
            // reload arrivals
            const data = await fetchDailyArrival(dateRangeStart, dateRangeEnd);
            setArrivals(data);
            // reset form
            setSelectedEmployeeId('');
            setNewArrivalDate('');
            setNewArrivalStatus('');
        } catch (err) {
            alert(err.message || "Failed to create daily arrival");
        }
    };

    // update arrival => let user change date or status
    const handleUpdateArrival = async (id, date, status) => {
        try {
            await updateDailyArrival(id, { date, status });
            alert("Arrival updated!");
            const data = await fetchDailyArrival(dateRangeStart, dateRangeEnd);
            setArrivals(data);
        } catch (err) {
            alert(err.message || "Failed to update arrival");
        }
    };

    // delete arrival
    const handleDeleteArrival = async (id) => {
        if (!window.confirm("Delete this arrival record?")) return;
        try {
            await deleteDailyArrival(id);
            alert("Deleted!");
            const data = await fetchDailyArrival(dateRangeStart, dateRangeEnd);
            setArrivals(data);
        } catch (err) {
            alert(err.message || "Failed to delete arrival");
        }
    };

    return (
        <div className="employee-arrival-page">
            <NavBar />
            <h2>Daily Employee Arrivals</h2>

            <div className="range-section">
                <label>Start Date:</label>
                <input
                    type="date"
                    value={dateRangeStart}
                    onChange={(e) => setDateRangeStart(e.target.value)}
                />
                <label>End Date:</label>
                <input
                    type="date"
                    value={dateRangeEnd}
                    onChange={(e) => setDateRangeEnd(e.target.value)}
                />
            </div>

            <div className="create-section">
                <h3>Create a New Daily Arrival</h3>
                <div className="create-form">
                    <label>Employee:</label>
                    <select
                        value={selectedEmployeeId}
                        onChange={(e) => setSelectedEmployeeId(e.target.value)}
                    >
                        <option value="">--Select--</option>
                        {employees.map(emp => (
                            <option key={emp.id} value={emp.id}>
                                {emp.name} (ID {emp.id})
                            </option>
                        ))}
                    </select>

                    <label>Date:</label>
                    <input
                        type="date"
                        value={newArrivalDate}
                        onChange={(e) => setNewArrivalDate(e.target.value)}
                    />

                    <label>Status:</label>
                    <input
                        type="text"
                        placeholder="e.g. Arrived, Sick..."
                        value={newArrivalStatus}
                        onChange={(e) => setNewArrivalStatus(e.target.value)}
                    />

                    <button onClick={handleCreateArrival}>Create</button>
                </div>
            </div>

            <h3>Arrival Records from {dateRangeStart} to {dateRangeEnd}</h3>
            <table className="arrival-table">
                <thead>
                <tr>
                    <th>ID</th>
                    <th>Employee</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
                </thead>
                <tbody>
                {arrivals.map(arr => (
                    <tr key={arr.id}>
                        <td>{arr.id}</td>
                        <td>{arr.employee_name} (ID {arr.employee_id})</td>
                        <td>
                            <input
                                type="date"
                                value={arr.date}
                                onChange={(e) => handleUpdateArrival(arr.id, e.target.value, arr.status)}
                            />
                        </td>
                        <td>
                            <input
                                type="text"
                                value={arr.status}
                                onChange={(e) => handleUpdateArrival(arr.id, arr.date, e.target.value)}
                            />
                        </td>
                        <td>
                            <button onClick={() => handleDeleteArrival(arr.id)}>Delete</button>
                        </td>
                    </tr>
                ))}
                {arrivals.length === 0 && (
                    <tr>
                        <td colSpan={5}>No arrivals found in this date range.</td>
                    </tr>
                )}
                </tbody>
            </table>
        </div>
    );
}
