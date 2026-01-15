import React, { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export default function App() {
  const [loading, setLoading] = useState(true);
  const [annualBudget, setAnnualBudget] = useState(500000);
  const [accruals, setAccruals] = useState([]);
  const [pendingInvoices, setPendingInvoices] = useState([]);
  const [approvedInvoices, setApprovedInvoices] = useState([]);
  const [paidInvoices, setPaidInvoices] = useState([]);
  const [rejectedInvoices, setRejectedInvoices] = useState([]);
  const [currentInvoice, setCurrentInvoice] = useState(null);
  const [manualEntry, setManualEntry] = useState({ vendor: '', date: '', amount: '' });
  const [accrualEntry, setAccrualEntry] = useState({ vendor: '', description: '', amount: '' });
  const [activeTab, setActiveTab] = useState('upload');
  const [activeSection, setActiveSection] = useState('invoices');
  const [parsing, setParsing] = useState(false);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const fileInputRef = useRef(null);

  // Handle file input click
  const handleUploadClick = () => {
    console.log('Upload clicked, ref:', fileInputRef.current);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Load data from localStorage
  useEffect(() => {
    try {
      const data = localStorage.getItem('ebilling-v2-data');
      if (data) {
        const parsed = JSON.parse(data);
        setAnnualBudget(parsed.annualBudget || 500000);
        setAccruals(parsed.accruals || []);
        setPendingInvoices(parsed.pendingInvoices || []);
        setApprovedInvoices(parsed.approvedInvoices || []);
        setPaidInvoices(parsed.paidInvoices || []);
        setRejectedInvoices(parsed.rejectedInvoices || []);
      }
    } catch (e) {
      console.log('No existing data, starting fresh');
    }
    setLoading(false);
  }, []);

  // Save data to localStorage
  const saveData = (data) => {
    try {
      localStorage.setItem('ebilling-v2-data', JSON.stringify({
        annualBudget: data.annualBudget ?? annualBudget,
        accruals: data.accruals ?? accruals,
        pendingInvoices: data.pendingInvoices ?? pendingInvoices,
        approvedInvoices: data.approvedInvoices ?? approvedInvoices,
        paidInvoices: data.paidInvoices ?? paidInvoices,
        rejectedInvoices: data.rejectedInvoices ?? rejectedInvoices
      }));
    } catch (e) {
      console.error('Failed to save data:', e);
    }
  };

  // Calculate totals
  const totalAccruals = accruals.reduce((sum, r) => sum + r.amount, 0);
  const totalPending = pendingInvoices.reduce((sum, r) => sum + r.amount, 0);
  const totalApproved = approvedInvoices.reduce((sum, r) => sum + r.amount, 0);
  const totalPaid = paidInvoices.reduce((sum, r) => sum + r.amount, 0);
  const totalCommitted = totalPaid + totalApproved + totalAccruals;
  const remaining = annualBudget - totalCommitted;
  const spendPercentage = (totalCommitted / annualBudget) * 100;

  // Parse PDF invoice
  const handlePDFUpload = async (e) => {
    console.log('File input changed:', e.target.files);
    const file = e.target.files[0];
    if (!file || file.type !== 'application/pdf') {
      alert('Please upload a PDF file');
      return;
    }

    setParsing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
      }

      const extractedData = extractInvoiceData(fullText, file.name);
      setCurrentInvoice(extractedData);
    } catch (error) {
      console.error('PDF parsing error:', error);
      alert('Failed to parse PDF. Please try manual entry.');
    }
    setParsing(false);
    e.target.value = '';
  };

  // Extract invoice data from text
  const extractInvoiceData = (text, fileName) => {
    const amountPatterns = [
      /total[:\s]*\$?([\d,]+\.?\d*)/i,
      /amount[:\s]*\$?([\d,]+\.?\d*)/i,
      /due[:\s]*\$?([\d,]+\.?\d*)/i,
      /balance[:\s]*\$?([\d,]+\.?\d*)/i,
      /\$\s*([\d,]+\.?\d*)/
    ];
    
    let amount = 0;
    for (const pattern of amountPatterns) {
      const match = text.match(pattern);
      if (match) {
        amount = parseFloat(match[1].replace(/,/g, ''));
        if (amount > 0) break;
      }
    }

    const datePatterns = [
      /date[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
      /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
      /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}/i
    ];

    let date = new Date().toISOString().split('T')[0];
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        const parsed = new Date(match[1] || match[0]);
        if (!isNaN(parsed)) {
          date = parsed.toISOString().split('T')[0];
          break;
        }
      }
    }

    let vendor = fileName.replace('.pdf', '').replace(/[_-]/g, ' ');
    const vendorPatterns = [
      /from[:\s]*([A-Za-z\s&]+(?:LLP|LLC|Inc|Corp)?)/i,
      /([A-Za-z\s&]+(?:LLP|LLC|Inc|Corp|Law))/
    ];
    for (const pattern of vendorPatterns) {
      const match = text.match(pattern);
      if (match && match[1].trim().length > 2) {
        vendor = match[1].trim().substring(0, 50);
        break;
      }
    }

    return {
      id: Date.now(),
      vendor,
      date,
      amount,
      rawText: text.substring(0, 500)
    };
  };

  // Handle manual entry submission
  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualEntry.vendor || !manualEntry.amount) {
      alert('Please enter vendor name and amount');
      return;
    }
    setCurrentInvoice({
      id: Date.now(),
      vendor: manualEntry.vendor,
      date: manualEntry.date || new Date().toISOString().split('T')[0],
      amount: parseFloat(manualEntry.amount),
      rawText: 'Manual entry'
    });
    setManualEntry({ vendor: '', date: '', amount: '' });
  };

  // Handle accrual entry
  const handleAccrualSubmit = (e) => {
    e.preventDefault();
    if (!accrualEntry.vendor || !accrualEntry.amount) {
      alert('Please enter vendor name and estimated amount');
      return;
    }
    const newAccrual = {
      id: Date.now(),
      vendor: accrualEntry.vendor,
      description: accrualEntry.description || 'Unbilled WIP',
      amount: parseFloat(accrualEntry.amount),
      createdDate: new Date().toISOString()
    };
    const newAccruals = [...accruals, newAccrual];
    setAccruals(newAccruals);
    saveData({ accruals: newAccruals });
    setAccrualEntry({ vendor: '', description: '', amount: '' });
  };

  // Remove accrual (when invoice arrives)
  const removeAccrual = (id) => {
    const newAccruals = accruals.filter(a => a.id !== id);
    setAccruals(newAccruals);
    saveData({ accruals: newAccruals });
  };

  // Add to pending (new invoice received)
  const addToPending = () => {
    if (!currentInvoice) return;
    const newPending = [...pendingInvoices, { ...currentInvoice, receivedDate: new Date().toISOString() }];
    setPendingInvoices(newPending);
    saveData({ pendingInvoices: newPending });
    setCurrentInvoice(null);
  };

  // Approve invoice (move from pending to approved/A/P)
  const approveInvoice = (invoice) => {
    const newPending = pendingInvoices.filter(i => i.id !== invoice.id);
    const newApproved = [...approvedInvoices, { ...invoice, approvedDate: new Date().toISOString() }];
    setPendingInvoices(newPending);
    setApprovedInvoices(newApproved);
    saveData({ pendingInvoices: newPending, approvedInvoices: newApproved });
  };

  // Mark as paid (move from approved to paid)
  const markAsPaid = (invoice) => {
    const newApproved = approvedInvoices.filter(i => i.id !== invoice.id);
    const newPaid = [...paidInvoices, { ...invoice, paidDate: new Date().toISOString() }];
    setApprovedInvoices(newApproved);
    setPaidInvoices(newPaid);
    saveData({ approvedInvoices: newApproved, paidInvoices: newPaid });
  };

  // Reject invoice
  const rejectInvoice = (invoice, fromList) => {
    let newPending = pendingInvoices;
    let newApproved = approvedInvoices;
    
    if (fromList === 'pending') {
      newPending = pendingInvoices.filter(i => i.id !== invoice.id);
      setPendingInvoices(newPending);
    } else if (fromList === 'approved') {
      newApproved = approvedInvoices.filter(i => i.id !== invoice.id);
      setApprovedInvoices(newApproved);
    }
    
    const newRejected = [...rejectedInvoices, { ...invoice, rejectedDate: new Date().toISOString() }];
    setRejectedInvoices(newRejected);
    saveData({ pendingInvoices: newPending, approvedInvoices: newApproved, rejectedInvoices: newRejected });
  };

  // Update budget
  const handleBudgetUpdate = () => {
    const newBudget = parseFloat(budgetInput.replace(/,/g, ''));
    if (isNaN(newBudget) || newBudget <= 0) {
      alert('Please enter a valid budget amount');
      return;
    }
    setAnnualBudget(newBudget);
    saveData({ annualBudget: newBudget });
    setEditingBudget(false);
    setBudgetInput('');
  };

  // Reset all data
  const resetData = () => {
    if (confirm('Are you sure you want to reset all data?')) {
      setAnnualBudget(500000);
      setAccruals([]);
      setPendingInvoices([]);
      setApprovedInvoices([]);
      setPaidInvoices([]);
      setRejectedInvoices([]);
      setCurrentInvoice(null);
      localStorage.removeItem('ebilling-v2-data');
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 md:p-6">
      {/* Hidden file input - placed at top level for reliable access */}
      <input 
        ref={fileInputRef}
        type="file" 
        accept=".pdf"
        onChange={handlePDFUpload}
        style={{ position: 'absolute', left: '-9999px' }}
      />
      
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">Legal Ops E-Billing</h1>
            <p className="text-slate-400 text-sm mt-1">Matter Budget, Accruals & A/P Management</p>
          </div>
          <button
            onClick={resetData}
            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
          >
            Reset Demo
          </button>
        </div>

        {/* Budget Overview Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Annual Budget */}
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <div className="flex justify-between items-start mb-1">
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">Annual Budget</span>
              <button
                onClick={() => { setEditingBudget(true); setBudgetInput(annualBudget.toString()); }}
                className="text-blue-400 hover:text-blue-300 text-xs"
              >
                Edit
              </button>
            </div>
            {editingBudget ? (
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  className="flex-1 bg-slate-700 border border-slate-600 rounded px-2 py-1 text-white text-sm"
                />
                <button onClick={handleBudgetUpdate} className="px-2 py-1 bg-blue-600 hover:bg-blue-500 rounded text-sm">Save</button>
              </div>
            ) : (
              <div className="text-2xl font-bold text-white">{formatCurrency(annualBudget)}</div>
            )}
          </div>

          {/* Actual Spend (Paid) */}
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">Actual Spend</span>
            <div className="text-2xl font-bold text-green-400 mt-1">{formatCurrency(totalPaid)}</div>
            <div className="text-slate-500 text-xs mt-1">{paidInvoices.length} invoices paid</div>
          </div>

          {/* Accruals */}
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">Accruals</span>
            <div className="text-2xl font-bold text-yellow-400 mt-1">{formatCurrency(totalAccruals)}</div>
            <div className="text-slate-500 text-xs mt-1">{accruals.length} unbilled estimates</div>
          </div>

          {/* Remaining */}
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <span className="text-slate-400 text-xs font-medium uppercase tracking-wide">Available</span>
            <div className={`text-2xl font-bold mt-1 ${remaining < 0 ? 'text-red-400' : 'text-blue-400'}`}>
              {formatCurrency(remaining)}
            </div>
            <div className="text-slate-500 text-xs mt-1">after commitments</div>
          </div>
        </div>

        {/* Commitment Breakdown Bar */}
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium">Budget Commitment Breakdown</span>
            <span className="text-sm text-slate-400">{spendPercentage.toFixed(1)}% committed</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-4 flex overflow-hidden">
            <div className="bg-green-500 h-4" style={{ width: `${(totalPaid / annualBudget) * 100}%` }} title="Paid" />
            <div className="bg-orange-500 h-4" style={{ width: `${(totalApproved / annualBudget) * 100}%` }} title="A/P (Approved)" />
            <div className="bg-yellow-500 h-4" style={{ width: `${(totalAccruals / annualBudget) * 100}%` }} title="Accruals" />
          </div>
          <div className="flex gap-4 mt-2 text-xs">
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500 rounded-sm"></span> Paid: {formatCurrency(totalPaid)}</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-orange-500 rounded-sm"></span> A/P: {formatCurrency(totalApproved)}</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-500 rounded-sm"></span> Accruals: {formatCurrency(totalAccruals)}</span>
          </div>
        </div>

        {/* A/P Pipeline */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 text-center">
            <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Pending Review</div>
            <div className="text-2xl font-bold text-slate-300">{pendingInvoices.length}</div>
            <div className="text-orange-400 font-medium">{formatCurrency(totalPending)}</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 text-center">
            <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Approved (A/P)</div>
            <div className="text-2xl font-bold text-slate-300">{approvedInvoices.length}</div>
            <div className="text-orange-400 font-medium">{formatCurrency(totalApproved)}</div>
          </div>
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 text-center">
            <div className="text-slate-400 text-xs uppercase tracking-wide mb-1">Paid</div>
            <div className="text-2xl font-bold text-slate-300">{paidInvoices.length}</div>
            <div className="text-green-400 font-medium">{formatCurrency(totalPaid)}</div>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveSection('invoices')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeSection === 'invoices' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Invoice Processing
          </button>
          <button
            onClick={() => setActiveSection('accruals')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeSection === 'accruals' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Accruals
          </button>
          <button
            onClick={() => setActiveSection('records')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeSection === 'records' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            All Records
          </button>
        </div>

        {/* Invoice Processing Section */}
        {activeSection === 'invoices' && (
          <div className="bg-slate-800 rounded-xl border border-slate-700">
            <div className="p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold">Invoice Processing</h2>
            </div>
            
            <div className="p-4">
              {/* Input Tabs */}
              <div className="flex gap-2 mb-4">
                <button
                  onClick={() => {
                    setActiveTab('upload');
                    setTimeout(() => fileInputRef.current?.click(), 100);
                  }}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'upload' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Upload PDF
                </button>
                <button
                  onClick={() => setActiveTab('manual')}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'manual' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Manual Entry
                </button>
              </div>

              {/* Upload Tab */}
              {activeTab === 'upload' && !currentInvoice && (
                <div className="border-2 border-dashed border-slate-600 rounded-xl p-6 text-center">
                  <button 
                    type="button"
                    onClick={handleUploadClick}
                    className="w-full flex flex-col items-center bg-transparent border-0 cursor-pointer"
                  >
                    <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center mb-3">
                      <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    {parsing ? (
                      <span className="text-blue-400">Parsing PDF...</span>
                    ) : (
                      <>
                        <span className="text-slate-300 font-medium">Click to upload PDF invoice</span>
                        <span className="text-slate-500 text-sm mt-1">Extracts vendor, date, and amount</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Manual Entry Tab */}
              {activeTab === 'manual' && !currentInvoice && (
                <form onSubmit={handleManualSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <input
                    type="text"
                    value={manualEntry.vendor}
                    onChange={(e) => setManualEntry({ ...manualEntry, vendor: e.target.value })}
                    className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                    placeholder="Vendor name"
                  />
                  <input
                    type="date"
                    value={manualEntry.date}
                    onChange={(e) => setManualEntry({ ...manualEntry, date: e.target.value })}
                    className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                  />
                  <input
                    type="number"
                    value={manualEntry.amount}
                    onChange={(e) => setManualEntry({ ...manualEntry, amount: e.target.value })}
                    className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                    placeholder="Amount"
                  />
                  <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium">
                    Add Invoice
                  </button>
                </form>
              )}

              {/* Current Invoice Review */}
              {currentInvoice && (
                <div className="bg-slate-700/50 rounded-xl p-4">
                  <h3 className="text-sm font-semibold mb-3 text-blue-400">New Invoice - Ready for Review</h3>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <span className="text-slate-400 text-xs">Vendor</span>
                      <div className="font-semibold">{currentInvoice.vendor}</div>
                    </div>
                    <div>
                      <span className="text-slate-400 text-xs">Date</span>
                      <div className="font-semibold">{currentInvoice.date}</div>
                    </div>
                    <div>
                      <span className="text-slate-400 text-xs">Amount</span>
                      <div className="font-semibold text-orange-400">{formatCurrency(currentInvoice.amount)}</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={addToPending} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium">
                      Add to Pending Review
                    </button>
                    <button onClick={() => setCurrentInvoice(null)} className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-sm font-medium">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Pending Invoices Queue */}
              {pendingInvoices.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold mb-2 text-slate-400">Pending Review ({pendingInvoices.length})</h3>
                  <div className="space-y-2">
                    {pendingInvoices.map((inv) => (
                      <div key={inv.id} className="bg-slate-700/30 rounded-lg p-3 flex justify-between items-center">
                        <div className="flex gap-6">
                          <div>
                            <div className="font-medium">{inv.vendor}</div>
                            <div className="text-slate-400 text-xs">{inv.date}</div>
                          </div>
                          <div className="text-orange-400 font-semibold">{formatCurrency(inv.amount)}</div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => approveInvoice(inv)}
                            className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-sm"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => rejectInvoice(inv, 'pending')}
                            className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-sm"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Approved (A/P) Queue */}
              {approvedInvoices.length > 0 && (
                <div className="mt-4">
                  <h3 className="text-sm font-semibold mb-2 text-orange-400">Accounts Payable ({approvedInvoices.length})</h3>
                  <div className="space-y-2">
                    {approvedInvoices.map((inv) => (
                      <div key={inv.id} className="bg-slate-700/30 rounded-lg p-3 flex justify-between items-center">
                        <div className="flex gap-6">
                          <div>
                            <div className="font-medium">{inv.vendor}</div>
                            <div className="text-slate-400 text-xs">Approved: {new Date(inv.approvedDate).toLocaleDateString()}</div>
                          </div>
                          <div className="text-orange-400 font-semibold">{formatCurrency(inv.amount)}</div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => markAsPaid(inv)}
                            className="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-sm"
                          >
                            Mark Paid
                          </button>
                          <button
                            onClick={() => rejectInvoice(inv, 'approved')}
                            className="px-3 py-1 bg-slate-600 hover:bg-slate-500 rounded text-sm"
                          >
                            Void
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Accruals Section */}
        {activeSection === 'accruals' && (
          <div className="bg-slate-800 rounded-xl border border-slate-700">
            <div className="p-4 border-b border-slate-700">
              <h2 className="text-lg font-semibold">Accruals (Unbilled WIP)</h2>
              <p className="text-slate-400 text-sm">Estimated spend for work in progress - not yet invoiced</p>
            </div>
            
            <div className="p-4">
              {/* Add Accrual Form */}
              <form onSubmit={handleAccrualSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                <input
                  type="text"
                  value={accrualEntry.vendor}
                  onChange={(e) => setAccrualEntry({ ...accrualEntry, vendor: e.target.value })}
                  className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                  placeholder="Law firm / vendor"
                />
                <input
                  type="text"
                  value={accrualEntry.description}
                  onChange={(e) => setAccrualEntry({ ...accrualEntry, description: e.target.value })}
                  className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                  placeholder="Matter / description"
                />
                <input
                  type="number"
                  value={accrualEntry.amount}
                  onChange={(e) => setAccrualEntry({ ...accrualEntry, amount: e.target.value })}
                  className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"
                  placeholder="Estimated amount"
                />
                <button type="submit" className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg text-sm font-medium">
                  Add Accrual
                </button>
              </form>

              {/* Accruals List */}
              {accruals.length === 0 ? (
                <div className="text-center text-slate-500 py-6">No accruals recorded</div>
              ) : (
                <div className="space-y-2">
                  {accruals.map((acc) => (
                    <div key={acc.id} className="bg-slate-700/30 rounded-lg p-3 flex justify-between items-center">
                      <div className="flex gap-6">
                        <div>
                          <div className="font-medium">{acc.vendor}</div>
                          <div className="text-slate-400 text-xs">{acc.description}</div>
                        </div>
                        <div className="text-yellow-400 font-semibold">{formatCurrency(acc.amount)}</div>
                      </div>
                      <button
                        onClick={() => removeAccrual(acc.id)}
                        className="px-3 py-1 bg-slate-600 hover:bg-slate-500 rounded text-sm"
                        title="Remove when invoice received"
                      >
                        Invoice Received
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* All Records Section */}
        {activeSection === 'records' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Paid Invoices */}
            <div className="bg-slate-800 rounded-xl border border-slate-700">
              <div className="p-3 border-b border-slate-700 flex justify-between items-center">
                <h3 className="font-semibold text-green-400">Paid ({paidInvoices.length})</h3>
                <span className="text-slate-400 text-sm">{formatCurrency(totalPaid)}</span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {paidInvoices.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 text-sm">No paid invoices</div>
                ) : (
                  paidInvoices.map((inv) => (
                    <div key={inv.id} className="p-3 border-b border-slate-700/50">
                      <div className="flex justify-between">
                        <div>
                          <div className="font-medium text-sm">{inv.vendor}</div>
                          <div className="text-slate-400 text-xs">{inv.date}</div>
                        </div>
                        <div className="text-green-400 font-semibold text-sm">{formatCurrency(inv.amount)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Rejected Invoices */}
            <div className="bg-slate-800 rounded-xl border border-slate-700">
              <div className="p-3 border-b border-slate-700">
                <h3 className="font-semibold text-red-400">Rejected ({rejectedInvoices.length})</h3>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {rejectedInvoices.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 text-sm">No rejected invoices</div>
                ) : (
                  rejectedInvoices.map((inv) => (
                    <div key={inv.id} className="p-3 border-b border-slate-700/50">
                      <div className="flex justify-between">
                        <div>
                          <div className="font-medium text-sm">{inv.vendor}</div>
                          <div className="text-slate-400 text-xs">{inv.date}</div>
                        </div>
                        <div className="text-red-400 font-semibold text-sm">{formatCurrency(inv.amount)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 text-center text-slate-500 text-xs">
          Legal Operations E-Billing System • Budget = Paid + A/P + Accruals + Available
        </div>
      </div>
    </div>
  );
}
