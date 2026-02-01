import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Palette,
  Tag,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Home,
  Car,
  Zap,
  Wifi,
  Shield,
  Heart,
  BookOpen,
  Film,
  ShoppingBag,
  MoreHorizontal,
  Briefcase,
  Gift,
  Coffee,
  Smartphone,
  Utensils,
  Gamepad2,
  Plane,
  HeartPulse
} from 'lucide-react';
import type { Category, TransactionType } from '@/types/finance';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/types/finance';
import { toast } from 'sonner';

interface CategoryManagerProps {
  customCategories: Category[];
  onAddCategory: (category: Omit<Category, 'id'>) => void;
  onDeleteCategory: (id: string) => void;
  onEditCategory: (category: Category) => void;
}

interface NewCategoryForm {
  name: string;
  type: TransactionType;
  color: string;
  icon: string;
}

const AVAILABLE_ICONS = [
  { id: 'ShoppingCart', component: ShoppingCart, label: 'Compras' },
  { id: 'Home', component: Home, label: 'Hogar' },
  { id: 'Car', component: Car, label: 'Auto' },
  { id: 'Zap', component: Zap, label: 'Energía' },
  { id: 'Wifi', component: Wifi, label: 'Internet' },
  { id: 'Shield', component: Shield, label: 'Seguro' },
  { id: 'Heart', component: Heart, label: 'Salud' },
  { id: 'BookOpen', component: BookOpen, label: 'Educación' },
  { id: 'Film', component: Film, label: 'Entretenimiento' },
  { id: 'ShoppingBag', component: ShoppingBag, label: 'Tienda' },
  { id: 'MoreHorizontal', component: MoreHorizontal, label: 'Otros' },
  { id: 'Briefcase', component: Briefcase, label: 'Trabajo' },
  { id: 'Gift', component: Gift, label: 'Regalo' },
  { id: 'Coffee', component: Coffee, label: 'Café' },
  { id: 'Smartphone', component: Smartphone, label: 'Tecnología' },
  { id: 'Utensils', component: Utensils, label: 'Comida' },
  { id: 'Gamepad2', component: Gamepad2, label: 'Juegos' },
  { id: 'Plane', component: Plane, label: 'Viajes' },
  { id: 'HeartPulse', component: HeartPulse, label: 'Bienestar' },
  { id: 'TrendingUp', component: TrendingUp, label: 'Inversión' },
  { id: 'TrendingDown', component: TrendingDown, label: 'Gasto' },
];

const AVAILABLE_COLORS = [
  { id: '#ef4444', name: 'Rojo' },
  { id: '#f97316', name: 'Naranja' },
  { id: '#f59e0b', name: 'Ámbar' },
  { id: '#84cc16', name: 'Lima' },
  { id: '#10b981', name: 'Esmeralda' },
  { id: '#14b8a6', name: 'Teal' },
  { id: '#06b6d4', name: 'Cyan' },
  { id: '#0ea5e9', name: 'Azul' },
  { id: '#3b82f6', name: 'Azul Rey' },
  { id: '#6366f1', name: 'Índigo' },
  { id: '#8b5cf6', name: 'Violeta' },
  { id: '#a855f7', name: 'Púrpura' },
  { id: '#d946ef', name: 'Fucsia' },
  { id: '#ec4899', name: 'Rosa' },
  { id: '#f43f5e', name: 'Rosa Fuerte' },
  { id: '#6b7280', name: 'Gris' },
];

export function CategoryManager({ 
  customCategories, 
  onAddCategory, 
  onDeleteCategory,
  onEditCategory 
}: CategoryManagerProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  
  const [newCategory, setNewCategory] = useState<NewCategoryForm>({
    name: '',
    type: 'expense',
    color: '#3b82f6',
    icon: 'ShoppingCart',
  });

  const allCategories = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES, ...customCategories];
  const expenseCustom = customCategories.filter(c => c.type === 'expense');
  const incomeCustom = customCategories.filter(c => c.type === 'income');

  const handleAddCategory = () => {
    if (!newCategory.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }

    // Check for duplicate names
    const exists = allCategories.some(
      c => c.name.toLowerCase() === newCategory.name.toLowerCase()
    );
    if (exists) {
      toast.error('Ya existe una categoría con ese nombre');
      return;
    }

    onAddCategory({
      name: newCategory.name.trim(),
      type: newCategory.type,
      color: newCategory.color,
      icon: newCategory.icon,
    });

    toast.success('Categoría creada');
    setNewCategory({
      name: '',
      type: 'expense',
      color: '#3b82f6',
      icon: 'ShoppingCart',
    });
    setIsAddDialogOpen(false);
  };

  const handleEditCategory = () => {
    if (!editingCategory) return;
    
    if (!editingCategory.name.trim()) {
      toast.error('El nombre es obligatorio');
      return;
    }

    onEditCategory(editingCategory);
    toast.success('Categoría actualizada');
    setIsEditDialogOpen(false);
    setEditingCategory(null);
  };

  const handleDeleteCategory = (category: Category) => {
    if (confirm(`¿Eliminar la categoría "${category.name}"?`)) {
      onDeleteCategory(category.id);
      toast.success('Categoría eliminada');
    }
  };

  const startEdit = (category: Category) => {
    setEditingCategory({ ...category });
    setIsEditDialogOpen(true);
  };

  const getIconComponent = (iconId: string) => {
    const icon = AVAILABLE_ICONS.find(i => i.id === iconId);
    return icon ? icon.component : ShoppingCart;
  };

  const CategoryCard = ({ category, isCustom }: { category: Category; isCustom: boolean }) => {
    const IconComponent = getIconComponent(category.icon);
    
    return (
      <div 
        className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ backgroundColor: `${category.color}20` }}
          >
            <IconComponent className="h-5 w-5" style={{ color: category.color }} />
          </div>
          <div>
            <p className="font-medium">{category.name}</p>
            <div className="flex items-center gap-2">
              <Badge variant={category.type === 'income' ? 'default' : 'secondary'} className="text-xs">
                {category.type === 'income' ? 'Ingreso' : 'Gasto'}
              </Badge>
              {!isCustom && (
                <span className="text-xs text-muted-foreground">Predeterminada</span>
              )}
            </div>
          </div>
        </div>
        
        {isCustom && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => startEdit(category)}
              className="h-8 w-8"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDeleteCategory(category)}
              className="h-8 w-8 text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Mis Categorías
            </CardTitle>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nueva Categoría
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Crear Nueva Categoría</DialogTitle>
                <DialogDescription>
                  Personaliza tus categorías para organizar mejor tus finanzas
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre</Label>
                  <Input
                    id="name"
                    placeholder="Ej: Gimnasio, Freelance, etc."
                    value={newCategory.name}
                    onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select 
                    value={newCategory.type} 
                    onValueChange={(v) => setNewCategory({ ...newCategory, type: v as TransactionType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expense">
                        <div className="flex items-center gap-2">
                          <TrendingDown className="h-4 w-4 text-red-500" />
                          Gasto
                        </div>
                      </SelectItem>
                      <SelectItem value="income">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-green-500" />
                          Ingreso
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Palette className="h-4 w-4" />
                    Color
                  </Label>
                  <div className="grid grid-cols-8 gap-2">
                    {AVAILABLE_COLORS.map((color) => (
                      <button
                        key={color.id}
                        onClick={() => setNewCategory({ ...newCategory, color: color.id })}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${
                          newCategory.color === color.id 
                            ? 'border-black dark:border-white scale-110' 
                            : 'border-transparent hover:scale-105'
                        }`}
                        style={{ backgroundColor: color.id }}
                        title={color.name}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Ícono</Label>
                  <div className="grid grid-cols-7 gap-2 max-h-32 overflow-y-auto p-1">
                    {AVAILABLE_ICONS.map((icon) => {
                      const IconComponent = icon.component;
                      return (
                        <button
                          key={icon.id}
                          onClick={() => setNewCategory({ ...newCategory, icon: icon.id })}
                          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                            newCategory.icon === icon.id
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted hover:bg-muted/80'
                          }`}
                          title={icon.label}
                        >
                          <IconComponent className="h-5 w-5" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Preview */}
                <div className="p-4 bg-muted rounded-lg">
                  <Label className="text-xs text-muted-foreground mb-2 block">Vista previa</Label>
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: `${newCategory.color}20` }}
                    >
                      {(() => {
                        const Icon = getIconComponent(newCategory.icon);
                        return <Icon className="h-5 w-5" style={{ color: newCategory.color }} />;
                      })()}
                    </div>
                    <span className="font-medium">
                      {newCategory.name || 'Nombre de categoría'}
                    </span>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleAddCategory}>
                  Crear Categoría
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
      </Card>

      {/* Custom Expense Categories */}
      {expenseCustom.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-500" />
              Mis Gastos Personalizados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {expenseCustom.map((category) => (
                <CategoryCard key={category.id} category={category} isCustom={true} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Custom Income Categories */}
      {incomeCustom.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              Mis Ingresos Personalizados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {incomeCustom.map((category) => (
                <CategoryCard key={category.id} category={category} isCustom={true} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Default Categories */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg text-muted-foreground">
            Categorías Predeterminadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].map((category) => (
              <CategoryCard key={category.id} category={category} isCustom={false} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Editar Categoría</DialogTitle>
          </DialogHeader>
          
          {editingCategory && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nombre</Label>
                <Input
                  id="edit-name"
                  value={editingCategory.name}
                  onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Palette className="h-4 w-4" />
                  Color
                </Label>
                <div className="grid grid-cols-8 gap-2">
                  {AVAILABLE_COLORS.map((color) => (
                    <button
                      key={color.id}
                      onClick={() => setEditingCategory({ ...editingCategory, color: color.id })}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        editingCategory.color === color.id 
                          ? 'border-black dark:border-white scale-110' 
                          : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: color.id }}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Ícono</Label>
                <div className="grid grid-cols-7 gap-2 max-h-32 overflow-y-auto p-1">
                  {AVAILABLE_ICONS.map((icon) => {
                    const IconComponent = icon.component;
                    return (
                      <button
                        key={icon.id}
                        onClick={() => setEditingCategory({ ...editingCategory, icon: icon.id })}
                        className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${
                          editingCategory.icon === icon.id
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted hover:bg-muted/80'
                        }`}
                        title={icon.label}
                      >
                        <IconComponent className="h-5 w-5" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleEditCategory}>
              Guardar Cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
