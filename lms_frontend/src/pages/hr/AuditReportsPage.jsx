import React, { useState, useEffect } from 'react';
import { hrAdminApi } from '../../api/hrAdminApi';
import { Search, Filter, Download, FileText, Calendar, CloudLightning } from 'lucide-react';
import '../../styles/epic8.css';

const ReportsPage = () => {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(false);
    const [filters, setFilters] = useState({
        date_from: '',
        date_to: '',
        course_id: '',
        status: '',
        payment_status: ''
    });

    useEffect(() => {
        fetchReports();
    }, []);

    const fetchReports = async () => {
        try {
            setLoading(true);
            const data = await hrAdminApi.getReport(filters);
            setReports(data.reports || []);
        } catch (err) {
            console.error('Failed to load reports');
        } finally {
            setLoading(false);
        }
    };

    const handleExport = async () => {
        try {
            setExporting(true);
            await hrAdminApi.exportCSV(filters);
        } catch (err) {
            alert('Export failed');
        } finally {
            setExporting(false);
        }
    };

    if (loading) return <div className="epic8-loader-container"><div className="spinner"></div></div>;

    return (
        <div className="epic8-page-container">
            <div className="epic8-header">
                <div>
                    <h1>Registration Reports</h1>
                    <p>Generate, filter and export academy performance audits</p>
                </div>
                <button 
                    className="btn-premium-primary" 
                    onClick={handleExport}
                    disabled={exporting}
                >
                    {exporting ? <div className="spinner-small" /> : <Download size={18} />}
                    Export CSV Data
                </button>
            </div>

            <div className="premium-card">
                <div className="search-filter-bar">
                    <div className="filter-select-wrapper">
                        <Calendar size={18} />
                        <input type="date" value={filters.date_from} onChange={(e) => setFilters({...filters, date_from: e.target.value})} />
                    </div>
                    <div className="filter-select-wrapper">
                        <Filter size={18} />
                        <select value={filters.status} onChange={(e) => setFilters({...filters, status: e.target.value})}>
                            <option value="">All Statuses</option>
                            <option value="pending">Pending</option>
                            <option value="active">Active</option>
                            <option value="expired">Expired</option>
                        </select>
                    </div>
                </div>

                <div className="table-wrapper">
                    <table className="epic8-table">
                        <thead>
                            <tr>
                                <th>Ref. Registration</th>
                                <th>Program Focus</th>
                                <th>Allocated Cohort</th>
                                <th>Registration Date</th>
                                <th>Audit Status</th>
                                <th>Financial Audit</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reports.map((r, id) => (
                                <tr key={id}>
                                    <td>
                                        <div className="table-primary-text">{r.registration_number || `REG-${id+100}`}</div>
                                        <div className="table-secondary-text">{r.full_name}</div>
                                    </td>
                                    <td>{r.course_name}</td>
                                    <td>{r.batch_name}</td>
                                    <td>{new Date(r.created_at).toLocaleDateString()}</td>
                                    <td>
                                        <span className={`status-badge status-${r.status}`}>{r.status.toUpperCase()}</span>
                                    </td>
                                    <td>
                                        <span className={`status-badge status-${r.payment_status}`}>{r.payment_status.toUpperCase()}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ReportsPage;
