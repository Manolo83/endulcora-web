import csv,collections,re,unicodedata,json
def norm(s):
    s=unicodedata.normalize('NFD',s.lower())
    s=''.join(c for c in s if unicodedata.category(c)!='Mn')
    return re.sub(r'\s+',' ',s).strip()

REGLAS=[
 ("Recetarios y eBooks", r"recetario|ebook|e-book"),
 ("Membresía",           r"membresia|mensualidad"),
 ("Pan de muerto",       r"pan de muerto|pan muerto"),
 ("Rosca de reyes",      r"rosca"),
 ("Galletas tipo Palacio", r"tipo palacio|palacio de hierro|palacio"),
 ("Galletas NY",         r"galletas ny|nueva york|new york|\bny\b"),
 ("Galletas navideñas",  r"galleta.*(navid|jengibre)|navid.*galleta"),
 ("Galletas decoradas",  r"galleta.*decorad|decorad.*galleta|galletas desde cero|bouquet de galletas|galleteria|galletas"),
 ("Tacos de canasta",    r"tacos? de canasta|canasta"),
 ("Taquiza de guisados", r"taquiza"),
 ("Palomitas gourmet",   r"palomita"),
 ("Repostería para diabéticos", r"diabetic|cero azucar|sin azucar"),
 ("Postres en vaso",     r"postres? en vaso|vasito"),
 ("Macarons",            r"macarr?on"),
 ("Pizza",               r"pizza"),
 ("Alitas",              r"alitas|alas de pollo"),
 ("Cupcakes florales",   r"cupcakes? floral|flores.*cupcake"),
 ("Pastel de cupcakes",  r"pastel de cupcake|bouquet de cupcake|cupcake"),
 ("Malteadas",           r"malteada"),
 ("Roles gourmet",       r"\broles?\b|cinnamon"),
 ("Rollo decorado navideño", r"rollo decorado|rollo navid|tronco navid"),
 ("Sushi",               r"sushi"),
 ("Banderillas coreanas",r"banderilla"),
 ("Gelatina floral",     r"gelatina.*floral|floral.*gelatina"),
 ("Gelatinas Marinela",  r"gelatina|mosaico"),
 ("Carnitas",            r"carnita"),
 ("Fresas cubiertas",    r"fresas? cubierta|fresas con chocolate|fresa"),
 ("Panes al vapor",      r"pan(es)? al vapor|bao"),
 ("Repostería canábica", r"canabic|cannabic|420"),
 ("Trufas gourmet",      r"trufa"),
 ("Pastas italianas",    r"pasta.*italian|pastas"),
 ("Postres italianos",   r"postres? italian|tiramisu"),
 ("Cocina italiana",     r"cocina italian"),
 ("Cocina china",        r"cocina china|comida china"),
 ("Cocina japonesa",     r"cocina japones"),
 ("Postres japoneses",   r"postres? japones|mochi|dorayaki"),
 ("Bolillo, telera y pambazo", r"bolillo|telera|pambazo"),
 ("Chocolatería",        r"chocolat|bombon|bomboneria"),
 ("Barbacoa",            r"barbacoa"),
 ("Pastel vintage",      r"vintage"),
 ("Ensaladas",           r"ensalada"),
 ("Empanadas argentinas",r"empanada"),
 ("Coctelería",          r"coctel|cocktel|mixolog|bebida|bubble tea"),
 ("Manzanas decoradas",  r"manzana"),
 ("Tamales",             r"tamal|atole"),
 ("Pays y tartas",       r"pay(s)?\b|tarta|cheesecake"),
 ("Panqués gourmet",     r"panque"),
 ("Velas comestibles",   r"vela"),
 ("Donas gourmet",       r"dona"),
 ("Crepas, waffles y hot cakes", r"crepa|waffle|hot ?cake|pancake"),
 ("Mesa de postres",     r"mesa de postre|mesa de dulce"),
 ("Aguas y bebidas frescas", r"agua(s)? (fresca|de sabor|michoacana)|aguas"),
 ("Fondant",             r"fondant"),
 ("Paella",              r"paella"),
 ("Chiles en nogada",    r"chile.*nogada"),
 ("Postres en nogada",   r"nogada"),
 ("Moles",               r"\bmole"),
 ("Dulces mexicanos",    r"dulces mexican|dulce.*tradicional"),
 ("Panadería masa madre",r"masa madre"),
 ("Panadería mexicana",  r"panaderia|concha|bisquet"),
 ("Croissant",           r"croissant|hojaldre"),
 ("Mamuts decorados",    r"mamut"),
 ("Birria",              r"birria"),
 ("Mixiotes",            r"mixiote"),
 ("Trilogía de pozoles", r"pozole"),
 ("Repostería canina y felina", r"canina|felina|mascota|perro"),
 ("Cocina yucateca",     r"yucatec|cochinita"),
 ("Cocina oaxaqueña",    r"oaxaqu"),
 ("Antojitos mexicanos", r"antojito"),
 ("Postres para cafetería", r"cafeteria|cafe\b"),
 ("Intensivo de pastelería", r"intensivo.*pasteler|pasteleria intensiv"),
 ("Pastelería mexicana",  r"pasteleria mexican"),
 ("Pastelería para principiantes", r"pasteleria.*principiante|pasteleria basica"),

 ("Macarons",            r"macaroon|macaron"),
 ("Cocina japonesa",     r"comida japones|ramen|duyado|douyin"),
 ("Cocina china",        r"pollo agridulce|kfc|agridulce"),
 ("Gomitas y dulces",    r"gomita|bolis|paleta|gomitas"),
 ("Cena navideña",       r"cena navid|postres navid|navid"),
 ("Buñuelos y churros",  r"bunuelo|churro"),
 ("Berlinesas",          r"berlinesa"),
 ("Mermeladas",          r"mermelada|conserva"),
 ("Donas gourmet",       r"donita|donut"),
 ("Cafetería de especialidad", r"matcha|pumpkin spice|latte|frappe"),
 ("Rollo decorado navideño", r"^rollo"),
 ("Helados y nieves",    r"helado|nieve|paleta de hielo"),
 ("Calaveritas de azúcar", r"calaverita|dia de muertos"),
 ("Postres sin horno",   r"sin horno"),
 ("Esferas navideñas",   r"esfera"),
 ("Panes laminados",     r"pan(es)? laminado|laminado"),
 ("Brownies",            r"brownie"),
 ("Lunch box cake",      r"lunch box|bento"),
 ("Master class",        r"master ?class"),
 ("Pastelería (otros)",   r"pasteleria|pastel|reposteria"),
]
def clasifica(s):
    n=norm(s)
    for canon,pat in REGLAS:
        if re.search(pat,n): return canon
    return None

rows=[r for r in list(csv.reader(open('registro_pagos.csv',encoding='utf-8')))[1:] if r and r[0].strip()]
def mes(s):
    m=re.match(r'(\d{1,2})/(\d{1,2})/(\d{4})',s.strip())
    return f"{m.group(3)}-{int(m.group(2)):02d}" if m else None
sinclas=collections.Counter(); datos=[]
for r in rows:
    t=clasifica(r[6]); m=mes(r[0])
    if r[6].strip() and t is None: sinclas[norm(r[6])[:60]]+=1
    if t and m: datos.append((m,t))
print("clasificados:",len(datos),"/",len(rows))
print("sin clasificar:",sum(sinclas.values()))
print("\nTOP sin clasificar:")
for k,v in sinclas.most_common(35): print(f"  {v:3d} {k}")
json.dump(datos,open('pagos_clasificados.json','w'))
