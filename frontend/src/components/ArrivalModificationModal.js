// src/components/ArrivalModificationModal.js

import React, { useState } from 'react';
import './ArrivalModificationModal.css';

export default function ArrivalModificationModal({ arrival, onClose, onSave }) {
    // arrival => { recordId, employeeId, employeeName, dayName, weekCode, arrivalStatus }
    const [status, setStatus] = useState(arrival.arrivalStatus);

    function handleSubmit(e) {
        e.preventDefault();
        // pass back to parent
        onSave({
            recordId: arrival.recordId,
            employeeId: arrival.employeeId,
            employeeName: arrival.employeeName,
            dayName: arrival.dayName,
            weekCode: arrival.weekCode,
            arrivalStatus: status
        });
    }

    return (
        <div className="arrival-modal-backdrop">
            <div className="arrival-modal-content">
                <h3>Set Arrival Status</h3>
                <p>
                    <strong>Employee:</strong> {arrival.employeeName}<br/>
                    <strong>Day:</strong> {arrival.dayName} ({arrival.weekCode})
                </p>
                <div className="status-options">
                    <label>Arrival Status:</label>
                    <select value={status} onChange={(e) => setStatus(e.target.value)}>
                        <option value="">-- Select --</option>
                        <option value="Arrived">Arrived</option>
                        <option value="Not Arrived">Not Arrived</option>
                        <option value="Sick">Sick</option>
                        <option value="Vacation">Vacation</option>
                        {/* etc. */}
                    </select>
                </div>
                <div className="modal-buttons">
                    <button onClick={onClose}>Cancel</button>
                    <button onClick={handleSubmit}>Save</button>
                </div>
            </div>
        </div>
    );
}
