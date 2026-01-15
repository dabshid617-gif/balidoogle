import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { Product, Tables } from './types';
import HomeView from './components/HomeView';
import SellView from './components/SellView';
import ProfileView from './components/ProfileView';
import ProductDetailView from './components/ProductDetailView';
import SavedView from './components/SavedView';
import Layout from './components/Layout';
import NotFound from './components/NotFound';
import { supabase } from './supabaseClient';

// Shape returned by listings + joined photos
 type ListingWithPhotos = Tables<'listings'> & {
  listing_photos?: { photo_url: string | null; is_primary: boolean | null }[];
};

const mapListingToProduct = (row: ListingWithPhotos): Product => {
  const photos = (row.listing_photos ?? [])
    .filter((p): p is { photo_url: string; is_primary: boolean | null } => !!p.photo_url)
    .sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0))
    .map((p) => p.photo_url);

  const primary = photos[0];
  const addressParts = [row.address, row.city, row.state].filter(Boolean).join(', ');
  return {
    id: row.id,
    title: row.title,
    price: Number(row.price),
    location: addressParts,
    address: row.address,
    city: row.city,
    state: row.state ?? undefined,
    image: primary ?? `https://picsum.photos/seed/${row.id}/400/300`,
    photos: photos.length ? photos : undefined,
    category: row.property_type ?? 'Apartments',
    verified: true,
    description: row.description ?? undefined,
    saved: false,
    condition: 'New',
    createdAt: row.created_at ?? undefined,
    bedrooms: row.bedrooms ?? undefined,
    bathrooms: row.bathrooms ?? undefined,
    areaSqft: row.area_sqft ?? undefined,
    isVisible: row.is_visible ?? undefined,
    isDeleted: row.is_deleted ?? undefined,
    ownerId: row.user_id,
  };
};

const ProductPage: React.FC<{
  products: Product[];
  onToggleSave: (id: string) => void;
  productId: string | null;
  onBack: () => void;
}> = ({ products, onToggleSave, productId, onBack }) => {
  const id = productId;
  const [loading, setLoading] = useState(false);
  const [product, setProduct] = useState<Product | null>(() => (id ? products.find((p) => p.id === id) || null : null));

  useEffect(() => {
    if (product || !id) return;
    const fetchOne = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('listings')
        .select('id,user_id,title,price,address,city,state,property_type,description,is_visible,is_deleted,bedrooms,bathrooms,area_sqft,created_at,listing_photos(photo_url,is_primary)')
        .eq('id', id)
        .limit(1)
        .single();
      setLoading(false);
      if (error || !data) {
        onBack();
        return;
      }
      setProduct(mapListingToProduct(data as ListingWithPhotos));
    };
    fetchOne();
  }, [id, product, onBack]);

  if (!id) return <div className="w-full py-6 text-center text-sm text-slate-500">No property selected.</div>;
  if (loading || !product) return <div className="w-full py-6 text-center text-sm text-slate-500">Loading property...</div>;

  return <ProductDetailView product={product} onBack={onBack} onToggleSave={onToggleSave} />;
};

const App: React.FC = () => {
  const [page, setPage] = useState<'home' | 'saved' | 'list' | 'profile' | 'product'>('home');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profileName, setProfileName] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(new Set());

  const loadWishlists = useCallback(
    async (userId: string) => {
      const { data, error } = await supabase.from('wishlists').select('listing_id').eq('user_id', userId);
      if (error || !data) {
        console.warn('Unable to load wishlist', error);
        setWishlistIds(new Set());
        setProducts((prev) => prev.map((p) => ({ ...p, saved: false })));
        return;
      }
      const ids = new Set<string>(data.map((r) => r.listing_id));
      setWishlistIds(ids);
      setProducts((prev) => prev.map((p) => ({ ...p, saved: ids.has(p.id) })));
    },
    []
  );

  const loadListings = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from('listings')
      .select('id,user_id,title,price,address,city,state,property_type,description,is_visible,is_deleted,bedrooms,bathrooms,area_sqft,created_at,listing_photos(photo_url,is_primary)')
      .eq('is_visible', true)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const mapped = (data ?? []).map(mapListingToProduct);
    setProducts(mapped.map((p) => ({ ...p, saved: wishlistIds.has(p.id) })));
    setLoading(false);
  }, [wishlistIds]);

  useEffect(() => {
    loadListings();
  }, [loadListings]);

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles').select('full_name').eq('id', userId).single();
    setProfileName(data?.full_name ?? '');
  };

  useEffect(() => {
    const initAuth = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      if (data.session?.user?.id) {
        fetchProfile(data.session.user.id);
        loadWishlists(data.session.user.id);
      }
    };
    initAuth();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user?.id) {
        fetchProfile(newSession.user.id);
        loadWishlists(newSession.user.id);
      } else {
        setProfileName('');
        setWishlistIds(new Set());
        setProducts((prev) => prev.map((p) => ({ ...p, saved: false })));
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [loadWishlists]);

  const savedProducts = useMemo(() => products.filter((p) => p.saved), [products]);
  const myProducts = useMemo(() => {
    if (!session?.user?.id) return [] as Product[];
    return products.filter((p) => p.ownerId === session.user.id);
  }, [products, session?.user?.id]);

  const toggleSave = useCallback(
    async (id: string) => {
      if (!session?.user?.id) {
        setError('Please sign in to save properties.');
        return;
      }
      const isSaved = wishlistIds.has(id);

      // optimistic UI
      setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, saved: !isSaved } : p)));
      setWishlistIds((prev) => {
        const next = new Set(prev);
        isSaved ? next.delete(id) : next.add(id);
        return next;
      });

      const { error } = isSaved
        ? await supabase.from('wishlists').delete().eq('user_id', session.user.id).eq('listing_id', id)
        : await supabase.from('wishlists').insert({ user_id: session.user.id, listing_id: id });

      if (error) {
        // rollback
        setProducts((prev) => prev.map((p) => (p.id === id ? { ...p, saved: isSaved } : p)));
        setWishlistIds((prev) => {
          const next = new Set(prev);
          if (isSaved) next.add(id); else next.delete(id);
          return next;
        });
        setError(error.message);
      }
    },
    [session?.user?.id, wishlistIds]
  );

  const deleteListing = useCallback(
    async (id: string) => {
      if (!session?.user?.id) return;
      const { error } = await supabase
        .from('listings')
        .update({ is_visible: false, is_deleted: true })
        .eq('id', id)
        .eq('user_id', session.user.id);
      if (error) {
        setError(error.message);
        return;
      }
      setProducts((prev) => prev.filter((p) => p.id !== id));
    },
    [session?.user?.id]
  );

  const addProduct = async (payload: Omit<Product, 'id'>, files?: File[]) => {
    const userId = session?.user?.id || (await supabase.auth.getUser().then(({ data }) => data.user?.id).catch(() => undefined));
    if (!userId) {
      setError('Please sign in to list a property.');
      return;
    }
    setSaving(true);
    setError(null);

    const { data, error } = await supabase
      .from('listings')
      .insert({
        user_id: userId,
        title: payload.title,
        description: payload.description ?? 'No description provided.',
        price: payload.price,
        bedrooms: payload.bedrooms ?? 1,
        bathrooms: payload.bathrooms ?? 1,
        area_sqft: payload.areaSqft ?? null,
        address: payload.address || payload.location || 'Mogadishu',
        city: payload.city || 'Mogadishu',
        state: payload.state ?? null,
        zip_code: null,
        property_type: payload.category,
        is_visible: payload.isVisible ?? true,
        is_deleted: false,
      })
      .select('id,user_id,title,price,address,city,state,property_type,description,is_visible,is_deleted,bedrooms,bathrooms,area_sqft,created_at')
      .single();

    if (error || !data) {
      setError(error?.message ?? 'Unable to create listing');
      setSaving(false);
      return;
    }

    let photoUrls: string[] = [];

    if (files?.length) {
      for (const [idx, file] of files.entries()) {
        const path = `${userId}/${data.id}/${Date.now()}-${idx}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('listing-photos')
          .upload(path, file, { cacheControl: '3600', upsert: false });
        if (!uploadError) {
          const { data: publicUrl } = supabase.storage.from('listing-photos').getPublicUrl(path);
          photoUrls.push(publicUrl.publicUrl);
        }
      }
    }

    if (!photoUrls.length) {
      photoUrls = [`https://picsum.photos/seed/${data.id}/400/300`];
    }

    await supabase.from('listing_photos').insert(
      photoUrls.map((url, idx) => ({ listing_id: data.id, photo_url: url, is_primary: idx === 0 }))
    );

    const newProduct = mapListingToProduct({
      ...data,
      listing_photos: photoUrls.map((url, idx) => ({ photo_url: url, is_primary: idx === 0 })),
    });

    setProducts((prev) => [newProduct, ...prev]);
    setSaving(false);
    setSelectedProductId(newProduct.id);
    setPage('product');
  };

  const signIn = async (email: string, password: string) => {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
  };

  const resetPassword = async (email: string) => {
    setAuthError(null);
    if (!email) {
      setAuthError('Please provide an email to reset password.');
      return;
    }
    const { data, error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) setAuthError(error.message);
    else alert('If that email exists, a password reset link was sent.');
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    setAuthError(null);
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    if (error) setAuthError(error.message);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfileName('');
    setWishlistIds(new Set());
    setProducts((prev) => prev.map((p) => ({ ...p, saved: false })));
  };

  const updateProfile = async (fullName: string) => {
    if (!session?.user.id) return;
    setAuthError(null);
    const { error } = await supabase.from('profiles').update({ full_name: fullName }).eq('id', session.user.id);
    if (error) setAuthError(error.message);
    else setProfileName(fullName);
  };

  const signInWithGoogle = async () => {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) setAuthError(error.message);
  };

  return (
    <Layout currentPage={page} onNavigate={(p) => setPage(p)}>
      {loading && <div className="w-full py-6 text-center text-sm text-slate-500">Loading listings...</div>}
      {error && <div className="w-full py-6 text-center text-sm text-red-500">{error}</div>}
      {!loading && (
        <>
          {page === 'home' && (
            <HomeView
              products={products}
              onProductClick={(p) => {
                setSelectedProductId(p.id);
                setPage('product');
              }}
              onToggleSave={toggleSave}
            />
          )}
          {page === 'saved' && (
            <SavedView
              products={savedProducts}
              onProductClick={(p) => {
                setSelectedProductId(p.id);
                setPage('product');
              }}
              onToggleSave={toggleSave}
            />
          )}
          {page === 'list' && <SellView onBack={() => setPage('home')} onCreate={addProduct} saving={saving} />}
          {page === 'profile' && (
            <ProfileView
              myProducts={myProducts}
              savedCount={savedProducts.length}
              session={session}
              profileName={profileName}
              authError={authError}
              onSignIn={signIn}
              onSignUp={signUp}
              onGoogleSignIn={signInWithGoogle}
              onSignOut={signOut}
              onUpdateProfile={updateProfile}
              onResetPassword={resetPassword}
              onViewListing={(id) => {
                setSelectedProductId(id);
                setPage('product');
              }}
              onDeleteListing={deleteListing}
            />
          )}
          {page === 'product' && (
            <ProductPage products={products} onToggleSave={toggleSave} productId={selectedProductId} onBack={() => setPage('home')} />
          )}
        </>
      )}
    </Layout>
  );
};

export default App;
