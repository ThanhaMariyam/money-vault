import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Label } from "../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "../components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";
import { PiggyBank, Plus, TrendingUp, LogOut, Download, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { format, subDays, subMonths, subYears, isAfter } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { jsPDF } from "jspdf";

interface SavingsRecord {
  _id: string;
  amount: number;
  date: string;
  screenshot?: string;
  createdAt: string;
}

interface ReportResponse {
  period: "weekly" | "monthly" | "yearly";
  generatedAt: string;
  totalSavings: number;
  recordCount: number;
  records: SavingsRecord[];
}

export default function Dashboard() {
  const { user, token, logout } = useAuth();
  const [records, setRecords] = useState<SavingsRecord[]>([]);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [screenshot, setScreenshot] = useState<string>("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  
  useEffect(() => {
    fetchRecords();
  }, [token]);

  const fetchRecords = async () => {
    try {
      const res = await fetch("/api/savings", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRecords(data);
      }
    } catch (error) {
      toast.error("Failed to fetch records");
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error("Image must be less than 2MB");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setScreenshot(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAddRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !date) {
      toast.error("Please fill required fields");
      return;
    }

    try {
      const res = await fetch("/api/savings", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ amount: Number(amount), date, screenshot }),
      });
      if (!res.ok) throw new Error("Failed to add record");
      
      toast.success("Savings recorded successfully!");
      setIsAddOpen(false);
      setAmount("");
      setScreenshot("");
      setDate(new Date().toISOString().split('T')[0]);
      fetchRecords();
    } catch (err) {
      toast.error("Failed to save record");
    }
  };

  const totalSavings = records.reduce((acc, curr) => acc + curr.amount, 0);

  const getFilteredRecords = (period: "all" | "weekly" | "monthly" | "yearly") => {
    const now = new Date();
    return records.filter(record => {
      const recordDate = new Date(record.date);
      if (period === "weekly") return isAfter(recordDate, subDays(now, 7));
      if (period === "monthly") return isAfter(recordDate, subMonths(now, 1));
      if (period === "yearly") return isAfter(recordDate, subYears(now, 1));
      return true;
    });
  };

  const hasRenderableScreenshot = (value?: string) =>
    typeof value === "string" && value.startsWith("data:image/");

    const generatePDF = async (period: "weekly" | "monthly" | "yearly") => {
    toast.info("Generating PDF, please wait...");

    try {
      const res = await fetch(`/api/savings/report?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error("Failed to fetch report data");
      }

      const report: ReportResponse = await res.json();
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 14;
      let y = margin;

      const formatCurrency = (amount: number) =>
        new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(amount);

      pdf.setFontSize(18);
      pdf.text(`${period.charAt(0).toUpperCase() + period.slice(1)} Savings Report`, margin, y);
      y += 8;

      pdf.setFontSize(11);
      pdf.text(`Generated on: ${format(new Date(report.generatedAt), "PPP p")}`, margin, y);
      y += 6;
      pdf.text(`Total savings: ${formatCurrency(report.totalSavings)}`, margin, y);
      y += 6;
      pdf.text(`Entries: ${report.recordCount}`, margin, y);
      y += 8;

      for (const record of report.records) {
        if (y > pageHeight - 45) {
          pdf.addPage();
          y = margin;
        }

        pdf.setFontSize(12);
        pdf.text(`${format(new Date(record.date), "PPP")}  -  ${formatCurrency(record.amount)}`, margin, y);
        y += 6;

        if (record.screenshot?.startsWith("data:image/")) {
          const imageType = record.screenshot.includes("image/png") ? "PNG" : "JPEG";
          try {
            pdf.addImage(record.screenshot, imageType, margin, y, 55, 35);
            y += 39;
          } catch {
            pdf.setFontSize(10);
            pdf.text("Screenshot unavailable in PDF.", margin, y);
            y += 6;
          }
        } else {
          y += 2;
        }
      }

      pdf.save(`${period}-savings-report.pdf`);
      toast.success("PDF generated successfully!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate PDF");
    }
  };

  const renderDashboardCharts = () => {
    // Group records by month for chart
    const monthlyData = records.reduce((acc, curr) => {
      const monthYear = format(new Date(curr.date), "MMM yyyy");
      if (!acc[monthYear]) acc[monthYear] = 0;
      acc[monthYear] += curr.amount;
      return acc;
    }, {} as Record<string, number>);

    const chartData = Object.keys(monthlyData).reverse().map(key => ({
      name: key,
      amount: monthlyData[key]
    })).slice(0, 6); // visual 6 months

    return (
      <div className="h-64 mt-4 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `₹${val}`} />
            <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }} />
            <Bar dataKey="amount" fill="#18181b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <PiggyBank className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl tracking-tight">Vault</span>
          </div>
          <div className="flex items-center space-x-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-primary">{user?.name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="flex items-center justify-start gap-2 p-2">
                  <div className="flex flex-col space-y-1 leading-none">
                    <p className="font-medium">{user?.name}</p>
                    <p className="w-[200px] truncate text-sm text-zinc-500">{user?.email}</p>
                  </div>
                </div>
                <DropdownMenuItem onClick={logout} className="text-red-600 cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Welcome & Overview */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Hello, {user?.name?.split(' ')[0]}</h1>
            <p className="text-zinc-500">Here's an overview of your savings.</p>
          </div>
          
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="shrink-0 gap-2">
                <Plus className="h-4 w-4" /> Add Savings
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogTitle>Add New Savings</DialogTitle>
              <DialogDescription>
                Record a new savings entry along with a payment screenshot.
              </DialogDescription>
              <form onSubmit={handleAddRecord} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount (₹)</Label>
                  <Input id="amount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="date">Date</Label>
                  <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="screenshot">Screenshot (optional)</Label>
                  <Input id="screenshot" type="file" accept="image/*" onChange={handleImageUpload} className="cursor-pointer file:text-primary file:bg-primary/10 file:border-0 file:rounded-md file:px-4 file:py-1 hover:file:bg-primary/20" />
                  {screenshot && (
                    <div className="mt-2 rounded-md border border-zinc-200 overflow-hidden relative group">
                       <img src={screenshot} alt="Preview" className="w-full h-32 object-cover" />
                    </div>
                  )}
                </div>
                <Button type="submit" className="w-full">Save Record</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="col-span-1 relative overflow-hidden bg-gradient-to-br from-zinc-900 to-zinc-800 dark:from-zinc-100 dark:to-zinc-300 text-zinc-50 dark:text-zinc-900 border-0 shadow-lg">
            <div className="absolute -top-6 -right-6 p-6 opacity-10">
               <PiggyBank className="w-32 h-32" />
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-300 dark:text-zinc-600 flex items-center gap-2 relative z-10">
                Total Savings <TrendingUp className="h-4 w-4 text-emerald-400 dark:text-emerald-500" />
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-5xl font-black tracking-tighter">₹{totalSavings.toLocaleString()}</div>
              <p className="text-sm mt-2 text-zinc-400 dark:text-zinc-500 font-medium">All time accumulated</p>
            </CardContent>
          </Card>
          
          <Card className="col-span-1 md:col-span-2 shadow-sm border-zinc-200 dark:border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-zinc-500">Savings Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              {records.length > 0 ? renderDashboardCharts() : (
                <div className="h-64 flex items-center justify-center text-sm text-zinc-400">
                  No data available yet. Start adding some savings!
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-sm border-zinc-200 dark:border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
            <div>
              <CardTitle className="text-xl">Savings History & Reports</CardTitle>
              <CardDescription>View your past records and download reports.</CardDescription>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Download className="h-4 w-4" /> Export PDF
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => generatePDF("weekly")}>Weekly Report</DropdownMenuItem>
                <DropdownMenuItem onClick={() => generatePDF("monthly")}>Monthly Report</DropdownMenuItem>
                <DropdownMenuItem onClick={() => generatePDF("yearly")}>Yearly Report</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardHeader>
          <CardContent className="pt-6">
            <Tabs defaultValue="all">
              <TabsList className="mb-4">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="monthly">This Month</TabsTrigger>
                <TabsTrigger value="yearly">This Year</TabsTrigger>
              </TabsList>
              
              <TabsContent value="all" className="mt-0">
                 {records.length === 0 ? (
                   <div className="text-center py-12 text-zinc-500 text-sm">
                     You haven't added any savings yet.
                   </div>
                 ) : (
                   <div className="border rounded-md overflow-hidden">
                     <Table>
                      <TableHeader className="bg-zinc-50 dark:bg-zinc-900 border-b">
                        <TableRow>
                          <TableHead className="w-[120px]">Date</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead className="w-[100px] text-right">Screenshot</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {records.map((record) => (
                          <TableRow key={record._id}>
                            <TableCell className="font-medium">{format(new Date(record.date), "MMM d, yyyy")}</TableCell>
                            <TableCell>₹{record.amount.toLocaleString()}</TableCell>
                            <TableCell className="text-right">
                              {hasRenderableScreenshot(record.screenshot) ? (
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-zinc-900">
                                      <ImageIcon className="h-4 w-4" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="sm:max-w-md">
                                    <DialogTitle>Payment Screenshot</DialogTitle>
                                    <div className="mt-4 rounded-md overflow-hidden bg-zinc-100 flex items-center justify-center p-2">
                                      <img src={record.screenshot} alt="Screenshot" className="max-w-full max-h-[70vh] object-contain rounded" />
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              ) : (
                                <span className="text-zinc-400">-</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                     </Table>
                   </div>
                 )}
              </TabsContent>
              <TabsContent value="monthly">
                 {/* Similar table but for monthly data... simplified by using records filter */}
                 <div className="border rounded-md overflow-hidden">
                     <Table>
                      <TableHeader className="bg-zinc-50 dark:bg-zinc-900 border-b">
                        <TableRow>
                          <TableHead className="w-[120px]">Date</TableHead>
                          <TableHead>Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                       <TableBody>
                         {getFilteredRecords("monthly").map((record) => (
                           <TableRow key={record._id}>
                             <TableCell className="font-medium">{format(new Date(record.date), "MMM d, yyyy")}</TableCell>
                             <TableCell>₹{record.amount.toLocaleString()}</TableCell>
                           </TableRow>
                         ))}
                         {getFilteredRecords("monthly").length === 0 && (
                            <TableRow>
                              <TableCell colSpan={2} className="text-center py-4 text-zinc-500">No records this month</TableCell>
                            </TableRow>
                         )}
                       </TableBody>
                     </Table>
                 </div>
              </TabsContent>
              <TabsContent value="yearly">
                 <div className="border rounded-md overflow-hidden">
                     <Table>
                       <TableHeader className="bg-zinc-50 dark:bg-zinc-900 border-b">
                        <TableRow>
                          <TableHead className="w-[120px]">Date</TableHead>
                          <TableHead>Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                       <TableBody>
                         {getFilteredRecords("yearly").map((record) => (
                           <TableRow key={record._id}>
                             <TableCell className="font-medium">{format(new Date(record.date), "MMM d, yyyy")}</TableCell>
                             <TableCell>₹{record.amount.toLocaleString()}</TableCell>
                           </TableRow>
                         ))}
                         {getFilteredRecords("yearly").length === 0 && (
                            <TableRow>
                              <TableCell colSpan={2} className="text-center py-4 text-zinc-500">No records this year</TableCell>
                            </TableRow>
                         )}
                       </TableBody>
                     </Table>
                 </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
