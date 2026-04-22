/**
 * Delete Request API Route
 * Allows admins to permanently delete requests from the system
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase-server';

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get('id');

    if (!requestId) {
      return NextResponse.json(
        { error: 'معرف الطلب مطلوب' },
        { status: 400 }
      );
    }

    console.log(`[DELETE_REQUEST] Admin attempting to delete request: ${requestId}`);

    const supabase = await createServiceRoleClient();

    // Verify the request exists first
    const { data: existingRequest, error: fetchError } = await supabase
      .from('publish_requests')
      .select('id, client_name, title, request_number')
      .eq('id', requestId)
      .single();

    if (fetchError || !existingRequest) {
      console.error('[DELETE_REQUEST] Request not found:', fetchError);
      return NextResponse.json(
        { error: 'الطلب غير موجود' },
        { status: 404 }
      );
    }

    console.log(`[DELETE_REQUEST] Found request to delete:`, {
      id: existingRequest.id,
      client_name: existingRequest.client_name,
      title: existingRequest.title,
      request_number: existingRequest.request_number
    });

    // Delete the request
    const { error: deleteError } = await supabase
      .from('publish_requests')
      .delete()
      .eq('id', requestId);

    if (deleteError) {
      console.error('[DELETE_REQUEST] Delete failed:', deleteError);
      return NextResponse.json(
        { error: 'فشل في حذف الطلب' },
        { status: 500 }
      );
    }

    console.log(`[DELETE_REQUEST] ✅ Successfully deleted request ${requestId}`);

    return NextResponse.json({
      success: true,
      message: 'تم حذف الطلب بنجاح',
      deletedRequest: {
        id: existingRequest.id,
        client_name: existingRequest.client_name,
        title: existingRequest.title,
        request_number: existingRequest.request_number
      }
    });

  } catch (error) {
    console.error('[DELETE_REQUEST] Exception:', error);
    return NextResponse.json(
      {
        error: 'خطأ في الخادم أثناء حذف الطلب',
        details: error instanceof Error ? error.message : 'خطأ غير معروف'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { requestId } = await request.json();

    if (!requestId) {
      return NextResponse.json(
        { error: 'معرف الطلب مطلوب' },
        { status: 400 }
      );
    }

    console.log(`[DELETE_REQUEST] POST - Admin attempting to delete request: ${requestId}`);

    const supabase = await createServiceRoleClient();

    // Verify the request exists first
    const { data: existingRequest, error: fetchError } = await supabase
      .from('publish_requests')
      .select('id, client_name, title, request_number, status')
      .eq('id', requestId)
      .single();

    if (fetchError || !existingRequest) {
      console.error('[DELETE_REQUEST] Request not found:', fetchError);
      return NextResponse.json(
        { error: 'الطلب غير موجود' },
        { status: 404 }
      );
    }

    console.log(`[DELETE_REQUEST] Found request to delete:`, {
      id: existingRequest.id,
      client_name: existingRequest.client_name,
      title: existingRequest.title,
      request_number: existingRequest.request_number,
      status: existingRequest.status
    });

    // Delete the request
    const { error: deleteError } = await supabase
      .from('publish_requests')
      .delete()
      .eq('id', requestId);

    if (deleteError) {
      console.error('[DELETE_REQUEST] Delete failed:', deleteError);
      return NextResponse.json(
        { error: 'فشل في حذف الطلب من قاعدة البيانات' },
        { status: 500 }
      );
    }

    console.log(`[DELETE_REQUEST] ✅ Successfully deleted request ${requestId}`);

    return NextResponse.json({
      success: true,
      message: 'تم حذف الطلب نهائياً',
      deletedRequest: {
        id: existingRequest.id,
        client_name: existingRequest.client_name,
        title: existingRequest.title,
        request_number: existingRequest.request_number,
        status: existingRequest.status
      }
    });

  } catch (error) {
    console.error('[DELETE_REQUEST] POST Exception:', error);
    return NextResponse.json(
      {
        error: 'خطأ في الخادم أثناء حذف الطلب',
        details: error instanceof Error ? error.message : 'خطأ غير معروف'
      },
      { status: 500 }
    );
  }
}