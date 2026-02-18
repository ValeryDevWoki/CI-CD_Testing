// src/components/EmployeeShiftRegistrationModal.js
import React, { useState, useEffect } from 'react';
import './ShiftModificationModal.css';
// we can reuse the same CSS class .modal-... to keep the style consistent
// or create a new .css if you prefer

export default function EmployeeShiftRegistrationModal({ shift, onSave, onClose }) {
    const [modifiedShift, setModifiedShift] = useState(shift);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        setModifiedShift(shift);
        setErrorMessage('');
    }, [shift]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setModifiedShift(prev => ({ ...prev, [name]: value }));
    };

    const handleSave = async () => {
        setErrorMessage('');
        try {
            // pass to parent => parent calls server
            await onSave(modifiedShift);
            onClose();
        } catch(err) {
            // catch error from server
            setErrorMessage(err.message);
        }
    };

    const isNew = !modifiedShift.id;

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h3>
                    {isNew ? 'Register Shift' : `Modify Shift for Employee #${modifiedShift.employee_id}`}
                </h3>

                {errorMessage && (
                    <div className="modal-error-alert">
                        {errorMessage.split('\n').map((line, idx) => (
                            <div key={idx}>{line}</div>
                        ))}
                    </div>
                )}

                <p>
                    <strong>Week:</strong> {modifiedShift.week_code || '(none)'} &nbsp;
                    <strong>Day:</strong> {modifiedShift.day_name || '(none)'}
                </p>

                {/* Start Time */}
                <div className="form-row">
                    <label>Start:</label>
                    <input
                        type="time"
                        name="start_time"
                        // default fallback to 09:00 if missing
                        value={modifiedShift.start_time || '09:00'}
                        onChange={handleChange}
                    />
                </div>

                {/* End Time */}
                <div className="form-row">
                    <label>End:</label>
                    <input
                        type="time"
                        name="end_time"
                        // default fallback to 17:00 if missing
                        value={modifiedShift.end_time || '17:00'}
                        onChange={handleChange}
                    />
                </div>

                {/* Note field */}
                <div className="form-row">
                    <label>Note:</label>
                    <textarea
                        name="note"
                        rows="3"
                        value={modifiedShift.note || ''}
                        onChange={handleChange}
                    />
                </div>

                <div className="modal-buttons">
                    <button className="save-button" onClick={handleSave}>Save</button>
                    <button className="cancel-button" onClick={onClose}>Cancel</button>
                </div>
            </div>
        </div>
    );
}
