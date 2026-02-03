import { useState, lazy, Suspense } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  PlusCircle,
  List,
  CreditCard,
  Lightbulb,
  Wallet,
  TrendingUp,
  TrendingDown,
  Menu,
  FileText,
  Bot,
  BarChart3,
  Download,
  LogOut,
  User,
  Tag,
  PiggyBank,
  Cloud,
  CloudOff,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useFinance } from '@/hooks/useFinance';
import { useAuth } from '@/hooks/useAuth';
import { ThemeToggle } from '@/components/ThemeToggle';
const Dashboard = lazy(() => import('@/sections/Dashboard').then(m => ({ default: m.Dashboard })));
const TransactionForm = lazy(() => import('@/sections/TransactionForm').then(m => ({ default: m.TransactionForm })));
const TransactionList = lazy(() => import('@/sections/TransactionList').then(m => ({ default: m.TransactionList })));
const DebtManager = lazy(() => import('@/sections/DebtManager').then(m => ({ default: m.DebtManager })));
const Recommendations = lazy(() => import('@/sections/Recommendations').then(m => ({ default: m.Recommendations })));
const PDFUploader = lazy(() => import('@/sections/PDFUploader').then(m => ({ default: m.PDFUploader })));
const DataExport = lazy(() => import('@/sections/DataExport').then(m => ({ default: m.DataExport })));
const AuthSection = lazy(() => import('@/sections/AuthSection').then(m => ({ default: m.AuthSection })));
const CategoryManager = lazy(() => import('@/sections/CategoryManager').then(m => ({ default: m.CategoryManager })));
const SavingsGoals = lazy(() => import('@/sections/SavingsGoals').then(m => ({ default: m.SavingsGoals })));
const VirtualAssistant = lazy(() => import('@/sections/VirtualAssistant').then(m => ({ default: m.VirtualAssistant })));
const HistoryCharts = lazy(() => import('@/sections/HistoryCharts').then(m => ({ default: m.HistoryCharts })));
import type { AnalysisResult } from '@/services/pdfAnalyzer';
import type { Transaction } from '@/types/finance';
import './App.css';

function App() {
  const { user, isAuthenticated, isLoading: authLoading, signOut } = useAuth();

  const {
    transactions,
    debts,
    customCategories,
    savingsGoals,
    isLoaded,
    isSyncing,
    lastSync,
    syncNow,
    addTransaction,
    deleteTransaction,
    editTransaction,
    addDebt,
    deleteDebt,
    updateDebtPayment,
    addCustomCategory,
    deleteCustomCategory,
    editCustomCategory,
    addSavingsGoal,
    deleteSavingsGoal,
    contributeToGoal,
    getSummary,
    getExpensesByCategory,
    getRecommendations,
    getUpcomingPayments,
    resetData,
  } = useFinance();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);



  const handleAddTransaction = (transaction: Parameters<typeof addTransaction>[0]) => {
    addTransaction(transaction);
    toast.success(
      transaction.type === 'income'
        ? 'Ingreso agregado correctamente'
        : 'Gasto agregado correctamente'
    );
  };

  const handleDeleteTransaction = (id: string) => {
    deleteTransaction(id);
    toast.success('Transacción eliminada');
  };

  const handleEditTransaction = (transaction: Transaction) => {
    editTransaction(transaction);
    toast.success('Transacción actualizada');
  };

  const handleAddDebt = (debt: Parameters<typeof addDebt>[0]) => {
    addDebt(debt);
    toast.success('Deuda agregada correctamente');
  };

  const handleDeleteDebt = (id: string) => {
    deleteDebt(id);
    toast.success('Deuda eliminada');
  };

  const handleUpdatePayment = (debtId: string) => {
    updateDebtPayment(debtId);
    toast.success('Pago registrado correctamente');
  };

  const handleAnalysisComplete = (result: AnalysisResult) => {
    // Add debts from analysis
    result.debtsToAdd.forEach(debt => {
      addDebt(debt);
    });

    // Add transactions from analysis
    result.transactionsToAdd.forEach(transaction => {
      addTransaction(transaction);
    });

    // Switch to debts tab to show new data
    setActiveTab('debts');
  };

  const summary = getSummary();
  const expensesByCategory = getExpensesByCategory();
  const recommendations = getRecommendations();
  const upcomingPayments = getUpcomingPayments();

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'transactions', label: 'Transacciones', icon: PlusCircle },
    { id: 'history', label: 'Historial', icon: List },
    { id: 'charts', label: 'Gráficos', icon: BarChart3 },
    { id: 'debts', label: 'Deudas', icon: CreditCard },
    { id: 'savings', label: 'Metas', icon: PiggyBank },
    { id: 'pdf', label: 'Analizar PDF', icon: FileText },
    { id: 'assistant', label: 'Asistente', icon: Bot },
    { id: 'categories', label: 'Categorías', icon: Tag },
    { id: 'export', label: 'Exportar', icon: Download },
    { id: 'recommendations', label: 'Recomendaciones', icon: Lightbulb },
  ];

  const renderMobileMenu = () => (
    <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64">
        <div className="flex flex-col gap-4 mt-8">
          <div className="px-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <img src="/favicon.png" alt="Logo" className="h-6 w-6 rounded-md shadow-sm" />
              Mi Control Financiero
            </h2>
          </div>
          <nav className="flex flex-col gap-1">
            {menuItems.map((item) => (
              <Button
                key={item.id}
                variant={activeTab === item.id ? 'secondary' : 'ghost'}
                className="justify-start"
                onClick={() => {
                  setActiveTab(item.id);
                  setIsMobileMenuOpen(false);
                }}
              >
                <item.icon className="h-4 w-4 mr-2" />
                {item.label}
              </Button>
            ))}
          </nav>
        </div>
      </SheetContent>
    </Sheet>
  );

  if (authLoading || !isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Show auth screen if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <Suspense fallback={<div className="flex h-screen items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
          <AuthSection />
        </Suspense>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" richColors closeButton mobileOffset={{ top: 10, right: 0, left: 0 }} />

      {/* Header */}
      <header className="sticky top-0 z-50 w-full glass">
        <div className="container mx-auto px-4 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {renderMobileMenu()}
              <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2 bg-gradient-to-r from-primary to-purple-400 bg-clip-text text-transparent">
                <img src="/favicon.png" alt="Logo" className="h-8 w-8 md:h-10 md:w-10 rounded-lg shadow-lg active:scale-95 transition-transform" />
                Mi Control Financiero
              </h1>
            </div>

            {/* Mobile Theme Toggle */}
            <div className="md:hidden">
              <ThemeToggle />
            </div>

            {/* Quick Stats */}
            <div className="hidden md:flex items-center gap-6">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 backdrop-blur-sm">
                <TrendingUp className="h-4 w-4 text-emerald-500" />
                <span className="text-xs font-medium text-muted-foreground">Ingresos</span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(summary.totalIncome)}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 backdrop-blur-sm">
                <TrendingDown className="h-4 w-4 text-red-500" />
                <span className="text-xs font-medium text-muted-foreground">Gastos</span>
                <span className="text-sm font-bold text-red-600 dark:text-red-400">{formatCurrency(summary.totalExpenses)}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 backdrop-blur-sm border border-primary/20">
                <Wallet className="h-4 w-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground">Balance</span>
                <span className={`text-sm font-bold ${summary.balance >= 0 ? 'text-primary' : 'text-red-600'}`}>
                  {formatCurrency(summary.balance)}
                </span>
              </div>

              {/* Sync Status */}
              {isAuthenticated && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={syncNow}
                  disabled={isSyncing}
                  className="gap-2 h-8"
                  title={lastSync ? `Última sincronización: ${lastSync.toLocaleTimeString()}` : 'No sincronizado'}
                >
                  {isSyncing ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : lastSync ? (
                    <Cloud className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <CloudOff className="h-3.5 w-3.5 text-yellow-500" />
                  )}
                  <span className="hidden lg:inline text-xs">
                    {isSyncing ? 'Sync...' : lastSync ? 'Listo' : 'Offline'}
                  </span>
                </Button>
              )}

              <div className="flex items-center gap-2 border-l pl-4 ml-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (window.confirm('¿Estás seguro de que deseas borrar TODOS los datos? Esta acción no se puede deshacer.')) {
                      resetData();
                    }
                  }}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
                  title="Reiniciar datos"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <ThemeToggle />
                <Button variant="ghost" size="icon" onClick={signOut} className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors">
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Suspense fallback={<div className="flex pt-20 justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            {/* Desktop Navigation */}
            <div className="hidden md:block">
              <TabsList className="grid w-full grid-cols-8">
                {menuItems.map((item) => (
                  <TabsTrigger key={item.id} value={item.id} className="flex items-center gap-2">
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* Mobile Navigation - Simple Tabs */}
            <div className="md:hidden">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="dashboard">
                  <LayoutDashboard className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="transactions">
                  <PlusCircle className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="savings">
                  <PiggyBank className="h-4 w-4" />
                </TabsTrigger>
                <TabsTrigger value="assistant">
                  <Bot className="h-4 w-4" />
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Dashboard Tab */}
            <TabsContent value="dashboard" className="space-y-6">
              <Dashboard
                summary={summary}
                expensesByCategory={expensesByCategory}
                upcomingPayments={upcomingPayments}
              />
            </TabsContent>

            {/* Transactions Tab */}
            <TabsContent value="transactions" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <TransactionForm
                  onAddTransaction={handleAddTransaction}
                  customCategories={customCategories}
                />
                <TransactionList
                  transactions={transactions.slice(0, 5)}
                  onDeleteTransaction={handleDeleteTransaction}
                  onEditTransaction={handleEditTransaction}
                  customCategories={customCategories}
                />
              </div>
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" className="space-y-6">
              <TransactionList
                transactions={transactions}
                onDeleteTransaction={handleDeleteTransaction}
                onEditTransaction={handleEditTransaction}
                customCategories={customCategories}
              />
            </TabsContent>

            {/* Charts Tab */}
            <TabsContent value="charts" className="space-y-6">
              <HistoryCharts
                transactions={transactions}
                debts={debts}
              />
            </TabsContent>

            {/* Debts Tab */}
            <TabsContent value="debts" className="space-y-6">
              <DebtManager
                debts={debts}
                onAddDebt={handleAddDebt}
                onDeleteDebt={handleDeleteDebt}
                onUpdatePayment={handleUpdatePayment}
              />
            </TabsContent>

            {/* Savings Goals Tab */}
            <TabsContent value="savings" className="space-y-6">
              <SavingsGoals
                goals={savingsGoals}
                availableBalance={summary.balance}
                onAddGoal={addSavingsGoal}
                onDeleteGoal={deleteSavingsGoal}
                onContribute={contributeToGoal}
              />
            </TabsContent>

            {/* PDF Analyzer Tab */}
            <TabsContent value="pdf" className="space-y-6">
              <PDFUploader
                onAnalysisComplete={handleAnalysisComplete}
                availableFunds={summary.balance}
              />
            </TabsContent>

            {/* Assistant Tab */}
            <TabsContent value="assistant" className="space-y-6">
              <VirtualAssistant
                debts={debts}
                transactions={transactions}
                summary={summary}
                onAddTransaction={addTransaction}
              />
            </TabsContent>

            {/* Categories Tab */}
            <TabsContent value="categories" className="space-y-6">
              <CategoryManager
                customCategories={customCategories}
                onAddCategory={addCustomCategory}
                onDeleteCategory={deleteCustomCategory}
                onEditCategory={editCustomCategory}
              />
            </TabsContent>

            {/* Export Tab */}
            <TabsContent value="export" className="space-y-6">
              <DataExport
                transactions={transactions}
                debts={debts}
              />
            </TabsContent>

            {/* Recommendations Tab */}
            <TabsContent value="recommendations" className="space-y-6">
              <Recommendations
                recommendations={recommendations}
                summary={summary}
              />
            </TabsContent>
          </Tabs>
        </Suspense>
      </main>

      {/* Footer */}
      <footer className="border-t mt-auto">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row items-center justify-center gap-2 text-sm text-muted-foreground">
            <p>Mi Control Financiero - Gestiona tus finanzas de forma inteligente</p>
            {user?.email && (
              <span className="flex items-center gap-1">
                <span>•</span>
                <User className="h-3 w-3" />
                {user.email}
              </span>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
